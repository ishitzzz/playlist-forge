/**
 * Shared multi-key routing pool (Gemini + YouTube).
 *
 * Design follows production LLM-gateway practice (LiteLLM router, Requesty):
 *  - Retries always pick a DIFFERENT deployment; no serial retries through a dead key.
 *  - A failing key goes into a timed cooldown and is dropped from every pick until
 *    the cooldown expires - so a dead key adds zero delay to later requests.
 *  - Cooldown length comes from the failure kind, and honors Retry-After when the
 *    provider sends one:
 *      rate_limit (per-minute 429)  -> Retry-After, else ~65s
 *      quota_daily (daily quota)    -> until the provider's daily reset
 *      auth / invalid key           -> 24h (the key is dead; trying it is wasted latency)
 *      transient (network/5xx)      -> tolerated once, then short exponential backoff
 *  - Selection is round-robin across healthy keys: same provider + same model means
 *    latency-based routing adds nothing measurable, while spreading requests evenly
 *    is what keeps per-key per-minute free-tier limits from tripping.
 *    (LiteLLM "simple-shuffle"/usage-based strategies make the same tradeoff.)
 *  - EWMA latency per key is tracked and logged for observability.
 *
 * Key discovery is dynamic: any number of env vars, no cap.
 *   GEMINI_API_KEY, GEMINI_API_KEY_2, ... GEMINI_API_KEY_N
 *   YOUTUBE_API_KEY, YOUTUBE_API_KEY_2, ... YOUTUBE_API_KEY_N
 */

export type FailureKind = "rate_limit" | "quota_daily" | "auth" | "transient";

interface KeyState {
    key: string;
    label: string;
    cooldownUntil: number; // epoch ms; 0 = healthy
    consecutiveTransientFailures: number;
    ewmaLatencyMs: number | null;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** ms until the next midnight in America/Los_Angeles (YouTube's daily quota reset). */
function msUntilPacificMidnight(now = Date.now()): number {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(new Date(now));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    // Approximate PT "now" as a UTC timestamp, add a day, then take the diff at PT midnight.
    const ptNow = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
    const ptNextMidnight = Date.UTC(get("year"), get("month") - 1, get("day"), 24, 0, 0);
    return Math.max(ptNextMidnight - ptNow, MINUTE);
}

/** Pull "retry in 37s" / retryDelay out of provider error text, if present. */
export function parseRetryAfterMs(error: unknown): number | null {
    const msg = error instanceof Error ? error.message : String(error);
    const m = /retry(?:\s+after|\s+in)?\s*([\d.]+)\s*s/i.exec(msg) || /"retryDelay"\s*:\s*"([\d.]+)s"/i.exec(msg);
    if (!m) return null;
    const sec = Number(m[1]);
    return Number.isFinite(sec) && sec > 0 ? Math.min(sec * SECOND, 30 * MINUTE) : null;
}

export class KeyPool {
    private states: KeyState[] = [];
    private rr = 0; // round-robin cursor
    private dailyReset: () => number;

    constructor(prefix: "GEMINI_API_KEY" | "YOUTUBE_API_KEY", dailyReset: () => number) {
        this.dailyReset = dailyReset;
        const env = Object.keys(process.env)
            .filter((k) => new RegExp(`^${prefix}(_\\d+)?$`).test(k))
            .sort((a, b) => {
                const na = a === prefix ? 1 : Number(a.slice(prefix.length + 1));
                const nb = b === prefix ? 1 : Number(b.slice(prefix.length + 1));
                return na - nb;
            });
        for (const name of env) {
            const value = (process.env[name] || "").trim();
            if (!value || value === "YOUR_SECONDARY_GEMINI_KEY") continue;
            const n = name === prefix ? 1 : Number(name.slice(prefix.length + 1));
            this.states.push({
                key: value,
                label: n === 1 ? "primary" : `key_${n}`,
                cooldownUntil: 0,
                consecutiveTransientFailures: 0,
                ewmaLatencyMs: null,
            });
        }
    }

    get size(): number {
        return this.states.length;
    }

    /** Next healthy key in round-robin order. Throws if every key is cooling down. */
    acquire(): { key: string; label: string } {
        if (this.states.length === 0) {
            throw new Error("No API keys configured in environment.");
        }
        const now = Date.now();
        const healthy = this.states.filter((s) => s.cooldownUntil <= now);
        if (healthy.length === 0) {
            const soonest = Math.min(...this.states.map((s) => s.cooldownUntil));
            const waitSec = Math.ceil((soonest - now) / 1000);
            throw new Error(`All ${this.states.length} keys are cooling down. Earliest recovery in ~${waitSec}s.`);
        }
        // Round-robin across the original ordering so load spreads evenly.
        const pick = healthy[this.rr % healthy.length];
        this.rr = (this.rr + 1) % healthy.length;
        return { key: pick.key, label: pick.label };
    }

    reportSuccess(label: string, latencyMs: number): void {
        const s = this.states.find((x) => x.label === label);
        if (!s) return;
        s.consecutiveTransientFailures = 0;
        s.ewmaLatencyMs = s.ewmaLatencyMs === null ? latencyMs : 0.3 * latencyMs + 0.7 * s.ewmaLatencyMs;
    }

    reportFailure(label: string, kind: FailureKind, retryAfterMs?: number | null): void {
        const s = this.states.find((x) => x.label === label);
        if (!s) return;
        const now = Date.now();
        switch (kind) {
            case "rate_limit":
                s.cooldownUntil = now + (retryAfterMs ?? 65 * SECOND);
                s.consecutiveTransientFailures = 0;
                break;
            case "quota_daily":
                s.cooldownUntil = now + this.dailyReset();
                s.consecutiveTransientFailures = 0;
                break;
            case "auth":
                s.cooldownUntil = now + 24 * HOUR;
                s.consecutiveTransientFailures = 0;
                break;
            case "transient":
                s.consecutiveTransientFailures += 1;
                // Tolerate the first blip (allowed_fails=1), then back off 30s, 60s, 120s...
                if (s.consecutiveTransientFailures > 1) {
                    s.cooldownUntil = now + Math.min(30 * SECOND * 2 ** (s.consecutiveTransientFailures - 2), 10 * MINUTE);
                }
                break;
        }
        const coolSec = Math.max(0, Math.round((s.cooldownUntil - now) / 1000));
        console.warn(`[KeyPool] ${label}: ${kind} failure${coolSec > 0 ? `, cooling down ${coolSec}s` : ""}`);
    }

    /** Seconds until the given label is eligible again (0 if healthy). */
    cooldownRemainingSec(label: string): number {
        const s = this.states.find((x) => x.label === label);
        if (!s) return 0;
        return Math.max(0, Math.ceil((s.cooldownUntil - Date.now()) / 1000));
    }
}

/** YouTube Data API daily quota resets at midnight Pacific. */
export function youtubeDailyResetMs(): number {
    return msUntilPacificMidnight();
}

/** Gemini free-tier daily limits reset 24h after exhaustion; no fixed wall-clock reset is published. */
export function geminiDailyResetMs(): number {
    return 24 * HOUR;
}
