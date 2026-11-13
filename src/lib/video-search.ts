// Prioritize official API to avoid IP blocking/scraping issues on Vercel
// Fallback to yt-search only if all API keys fail.

import { KeyPool, youtubeDailyResetMs, FailureKind } from "./key-pool";

export interface VideoResult {
    videoId: string;
    title: string;
    timestamp: string; // Duration
    channel: string;
    views: number;
    url: string;
    thumbnail: string;
}

interface RawVideoItem {
    videoId: string;
    title: string;
    seconds: number;
    timestamp: string;
    views: number;
    url: string;
    image: string;
    thumbnail: string;
    author: {
        name: string;
    };
}

// ---------------------------------------------------------------------------
// 1. API Key Routing (shared pool: dynamic count, round-robin, cooldowns)
// ---------------------------------------------------------------------------

// Dynamic key pool: YOUTUBE_API_KEY plus YOUTUBE_API_KEY_2 .. YOUTUBE_API_KEY_N (any count).
// Round-robin across healthy keys; a failing key cools down and is skipped, so a
// dead key adds zero delay to later requests. See key-pool.ts for the design.
const youtubePool = new KeyPool("YOUTUBE_API_KEY", youtubeDailyResetMs);

function classifyYouTubeError(status: number, body: string): FailureKind {
    const msg = body.toLowerCase();
    if (status === 403) {
        if (msg.includes("quota")) return "quota_daily"; // daily quota, resets midnight Pacific
        return "auth"; // key invalid / suspended / API not enabled: dead key, don't retry today
    }
    if (status === 429) return "rate_limit";
    return "transient";
}

async function searchYouTubeAPIWithRotation(query: string): Promise<RawVideoItem[]> {
    if (youtubePool.size === 0) {
        console.warn("No YOUTUBE_API_KEYs found in environment variables.");
        return [];
    }

    // One attempt per healthy key; each retry uses a DIFFERENT key (no serial
    // retries through a dead one). Cooled-down keys are skipped entirely.
    for (let attempt = 0; attempt < youtubePool.size; attempt++) {
        let acquired: { key: string; label: string };
        try {
            acquired = youtubePool.acquire();
        } catch (e) {
            console.warn((e as Error).message);
            break; // every key is cooling down
        }
        const { key: apiKey, label } = acquired;
        const maskedKey = apiKey.substring(0, 4) + "...";
        const started = Date.now();

        try {
            const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(query)}&type=video&key=${apiKey}`;
            const response = await fetch(url);

            if (response.ok) {
                const data = await response.json();
                if (!data.items) {
                    console.warn(`${label} worked but returned no items.`);
                    youtubePool.reportSuccess(label, Date.now() - started);
                    return [];
                }
                console.log(`${label} (${maskedKey}) success! Found ${data.items.length} videos.`);
                youtubePool.reportSuccess(label, Date.now() - started);
                return await enrichWithDurations(mapApiToRaw(data.items), apiKey);
            }

            const errorText = await response.text();
            console.error(`${label} failed: ${response.status} ${response.statusText}`, errorText);

            if (response.status === 400) {
                // Bad request: it's the query, not the key. Don't rotate.
                break;
            }
            youtubePool.reportFailure(label, classifyYouTubeError(response.status, errorText));
            continue;
        } catch (e) {
            console.error(`${label} network error:`, e);
            youtubePool.reportFailure(label, "transient");
            continue;
        }
    }

    console.warn("All YouTube API keys failed or are cooling down.");
    return [];
}

function isoToSeconds(iso: string): number {
    const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
    if (!m) return 0;
    return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

function secondsToTimestamp(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
    return (h > 0 ? h + ":" : "") + mm + ":" + String(s).padStart(2, "0");
}

// The search endpoint has no duration. videos.list costs 1 quota unit per call for up to 50 ids.
async function enrichWithDurations(items: RawVideoItem[], apiKey: string): Promise<RawVideoItem[]> {
    try {
        const ids = items.map((i) => i.videoId).join(",");
        const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${ids}&key=${apiKey}`);
        if (!r.ok) return items;
        const data = await r.json();
        const byId = new Map<string, any>((data.items || []).map((v: any) => [v.id, v]));
        return items.map((it) => {
            const v = byId.get(it.videoId);
            if (!v) return it;
            const seconds = isoToSeconds(v.contentDetails?.duration);
            return { ...it, seconds, timestamp: seconds ? secondsToTimestamp(seconds) : it.timestamp, views: Number(v.statistics?.viewCount || 0) };
        });
    } catch {
        return items;
    }
}

function mapApiToRaw(items: any[]): RawVideoItem[] {
    return items.map((item: any) => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        seconds: 0, // Duration requires separate API call
        timestamp: "Unknown",
        views: 0,
        url: `https://youtube.com/watch?v=${item.id.videoId}`,
        image: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
        author: {
            name: item.snippet.channelTitle
        }
    }));
}

// ---------------------------------------------------------------------------
// 2. Main Search Functions
// ---------------------------------------------------------------------------

function augment(query: string, level: string): string {
    if (level === "Undergrad" || level === "Post-Grad") return query + " lecture OR tutorial -shorts";
    return query + " explained simply -shorts";
}

async function fetchRaw(augmentedQuery: string, limit: number): Promise<RawVideoItem[]> {
    // Primary: official API with key rotation (scraping from Vercel IPs gets blocked).
    let videos: RawVideoItem[] = await searchYouTubeAPIWithRotation(augmentedQuery);
    // Fallback: yt-search scraper
    if (videos.length === 0) {
        try {
            const { default: yts } = await import("yt-search");
            const r = await yts(augmentedQuery);
            if (r && r.videos && r.videos.length > 0) videos = r.videos.slice(0, limit) as unknown as RawVideoItem[];
        } catch (error) {
            console.warn("Fallback scraper search failed (likely blocked or module missing).", error);
        }
    }
    return videos;
}

// Free, keyless check: oEmbed returns 401/404 for private, removed or non-embeddable videos.
async function isPlayable(videoId: string): Promise<boolean> {
    try {
        const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent("https://www.youtube.com/watch?v=" + videoId)}&format=json`, { signal: AbortSignal.timeout(4000) });
        if (r.status === 404 || r.status === 401 || r.status === 403) return false;
        return true; // on timeouts or other errors, do not discard
    } catch {
        return true;
    }
}

const STOP = new Set(["the", "and", "for", "with", "of", "in", "to", "a", "an", "on", "lecture", "tutorial", "explained", "simply", "shorts", "or", "introduction", "basics", "full", "course"]);
function tokens(str: string): string[] {
    return (str.toLowerCase().match(/[a-z0-9+#]{2,}/g) || []).filter((t) => !STOP.has(t));
}

// Share of the module's topic words that appear in the video title (0..1).
function topicOverlap(topic: string, title: string): number {
    const want = Array.from(new Set(tokens(topic)));
    if (want.length === 0) return 1;
    const have = new Set(tokens(title));
    return want.filter((t) => have.has(t)).length / want.length;
}

const LANG_WORDS: Record<string, RegExp> = {
    hindi: /hindi|हिंदी|हिन्दी|hinglish/i,
    bangla: /bangla|bengali/i, tamil: /tamil/i, telugu: /telugu/i, marathi: /marathi/i, gujarati: /gujarati/i,
    punjabi: /punjabi/i, urdu: /urdu/i, sinhala: /sinhala/i, nepali: /nepali/i, malayalam: /malayalam/i, kannada: /kannada/i,
    odia: /odia/i, arabic: /arabic/i, spanish: /spanish|español/i, french: /french|français/i, german: /german|deutsch/i,
    russian: /russian/i, portuguese: /portugu/i, indonesian: /indonesia/i, turkish: /turk/i,
};

function wantedKeys(language?: string): string[] {
    const l = (language || "english").toLowerCase();
    if (l.includes("hinglish") || l.includes("hindi")) return ["hindi"];
    if (l.includes("english")) return [];
    return Object.keys(LANG_WORDS).filter((k) => l.includes(k));
}

// Rejects titles that name a language other than the requested one, and for English
// also rejects mostly non-Latin titles.
function languageOk(title: string, channel: string, language?: string): boolean {
    const want = wantedKeys(language);
    const text = `${title} ${channel}`;
    for (const [k, re] of Object.entries(LANG_WORDS)) {
        if (!want.includes(k) && re.test(text)) return false;
    }
    if (want.length === 0) {
        const letters = title.match(/\p{L}/gu) || [];
        if (letters.length === 0) return true;
        const latin = title.match(/\p{Script=Latin}/gu) || [];
        return latin.length / letters.length >= 0.7;
    }
    return true;
}

// For a non-English request, a title or channel that says the language (or is in Devanagari for Hindi) ranks first.
function languageMatches(title: string, channel: string, language?: string): boolean {
    const want = wantedKeys(language);
    if (want.length === 0) return true;
    const text = `${title} ${channel}`;
    if (want.includes("hindi") && /[\u0900-\u097F]/.test(text)) return true;
    return want.some((k) => LANG_WORDS[k].test(text));
}

function toResult(best: RawVideoItem): VideoResult {
    return {
        videoId: best.videoId,
        title: best.title,
        timestamp: best.timestamp || "Unknown",
        channel: best.author?.name || "Unknown Channel",
        views: best.views || 0,
        url: best.url,
        thumbnail: best.thumbnail || best.image || "",
    };
}

/**
 * Ranked, filtered candidates: no ids in `exclude`, on-topic, right language, playable.
 * `topic` is the module title plus query; used for the relevance check.
 */
export async function searchCandidates(
    query: string,
    topic: string,
    durationPref: "short" | "medium" | "long",
    level: string,
    exclude: Set<string> = new Set(),
    language?: string,
    limit = 15
): Promise<VideoResult[]> {
    const want = wantedKeys(language);
    let q = query;
    if (want.length && !new RegExp(want.join("|"), "i").test(q)) q += " " + want[0];
    const raw = await fetchRaw(augment(q, level), limit);
    let pool = rankVideos(raw, durationPref).filter((v) => !exclude.has(v.videoId) && languageOk(v.title, v.author?.name || "", language));
    // Prefer on-topic. Keep a relaxed pass so a module never ends up empty if everything is weak.
    const onTopic = pool.filter((v) => topicOverlap(topic, v.title) >= 0.34);
    if (onTopic.length > 0) pool = onTopic;
    // Never pick a video wildly past the target length (e.g. a 7 hour video for a short revision module).
    const sane = pool.filter((v) => !v.seconds || overlongPenalty(v.seconds, durationPref) < 60);
    if (sane.length > 0) pool = sane;
    // Requested language first (stable sort keeps the earlier ranking inside each group).
    const inLang = pool.filter((v) => languageMatches(v.title, v.author?.name || "", language));
    if (inLang.length > 0) pool = [...inLang, ...pool.filter((v) => !inLang.includes(v))];
    const out: VideoResult[] = [];
    for (const v of pool) {
        if (await isPlayable(v.videoId)) out.push(toResult(v));
        if (out.length >= 5) break;
    }
    return out;
}

export async function searchVideoForModule(
    query: string,
    durationPref: "short" | "medium" | "long",
    typePref: "concept" | "tutorial" | "lecture",
    level: string,
    exclude: Set<string> = new Set(),
    language?: string,
    topic?: string
): Promise<VideoResult | null> {
    const c = await searchCandidates(query, topic || query, durationPref, level, exclude, language);
    return c[0] || null;
}

export async function searchVideoReplacement(
    query: string,
    durationPref: "short" | "medium" | "long",
    level: string,
    excludeVideoId: string,
    exclude: string[] = [],
    language?: string
): Promise<VideoResult | null> {
    const ex = new Set([excludeVideoId, ...exclude]);
    const c = await searchCandidates(query, query, durationPref, level, ex, language, 20);
    return c[0] || null;
}

// ---------------------------------------------------------------------------
// 3. Ranking Helpers
// ---------------------------------------------------------------------------

function rankVideos(videos: RawVideoItem[], durationPref: "short" | "medium" | "long"): RawVideoItem[] {
    return videos
        .filter((v) => {
            if (v.seconds && v.seconds < 60) return false; // Filter shorts if known
            return true;
        })
        .sort((a, b) => {
            let scoreA = 0;
            let scoreB = 0;

            if (a.seconds) scoreA += getDurationScore(a.seconds, durationPref) - overlongPenalty(a.seconds, durationPref);
            if (b.seconds) scoreB += getDurationScore(b.seconds, durationPref) - overlongPenalty(b.seconds, durationPref);

            if (!isAllCaps(a.title)) scoreA += 5;
            if (!isAllCaps(b.title)) scoreB += 5;

            const eduKeywords = ["academy", "university", "institute", "lecture", "course", "professor", "mit", "stanford", "freecodecamp", "crash course"];
            if (a.author && eduKeywords.some(k => a.author.name.toLowerCase().includes(k))) scoreA += 10;
            if (b.author && eduKeywords.some(k => b.author.name.toLowerCase().includes(k))) scoreB += 10;

            return scoreB - scoreA;
        });
}

// A 24 hour course is a miss for an intro module. Penalise videos far past the target range.
// Targets: short <= 10 min, medium <= 30 min, long <= 90 min. Penalty starts at 3x the target.
function overlongPenalty(seconds: number, pref: "short" | "medium" | "long"): number {
    const limit = pref === "short" ? 10 : pref === "medium" ? 30 : 90;
    const min = seconds / 60;
    if (min <= limit * 3) return 0;
    return min > limit * 8 ? 60 : 30; // outweighs the +10 duration and +10 channel boosts
}

function getDurationScore(seconds: number, pref: "short" | "medium" | "long"): number {
    const min = seconds / 60;
    if (pref === "short") return min >= 1 && min <= 10 ? 10 : 0;
    if (pref === "medium") return min > 10 && min <= 30 ? 10 : 0;
    return min > 30 ? 10 : 0;
}

function isAllCaps(str: string): boolean {
    return !!str && str === str.toUpperCase() && str.length > 5;
}
