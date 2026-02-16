/**
 * 🛡️ Robust JSON Parser — Handles Gemini's messy output
 * 
 * Copied from Dojo: src/utils/safeJsonParser.ts
 * No modifications needed — this file has no internal imports.
 * 
 * Gemini sometimes returns:
 * - Markdown-wrapped JSON (```json ... ```)
 * - Thinking tokens before the JSON
 * - Trailing commas
 * - Single-quoted strings
 * - Comments inside JSON
 * - Truncated/unterminated strings
 * - Leading text like "Here's the response:"
 */

/**
 * Attempts to extract and parse a JSON OBJECT from dirty text.
 * Tries multiple strategies in order of reliability.
 */
export function safeParseJsonObject<T = Record<string, unknown>>(text: string): T | null {
    // Strategy 1: Direct parse (maybe it's already clean)
    try {
        const parsed = JSON.parse(text);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            return parsed as T;
        }
    } catch { /* continue */ }

    // Strategy 2: Strip markdown fences and try again
    const stripped = stripMarkdownFences(text);
    try {
        const parsed = JSON.parse(stripped);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            return parsed as T;
        }
    } catch { /* continue */ }

    // Strategy 3: Find the outermost { ... } and clean it
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
        const cleaned = cleanJsonString(objectMatch[0]);
        try {
            return JSON.parse(cleaned) as T;
        } catch { /* continue */ }
    }

    // Strategy 4: Aggressive cleaning
    if (objectMatch) {
        const aggressive = aggressiveClean(objectMatch[0]);
        try {
            return JSON.parse(aggressive) as T;
        } catch { /* continue  */ }
    }

    return null;
}

/**
 * Attempts to extract and parse a JSON ARRAY from dirty text.
 * Tries multiple strategies in order of reliability.
 */
export function safeParseJsonArray<T = unknown>(text: string): T[] | null {
    // Strategy 1: Direct parse
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed as T[];
    } catch { /* continue */ }

    // Strategy 2: Strip markdown fences
    const stripped = stripMarkdownFences(text);
    try {
        const parsed = JSON.parse(stripped);
        if (Array.isArray(parsed)) return parsed as T[];
    } catch { /* continue */ }

    // Strategy 3: Find the outermost [ ... ] and clean it
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
        const cleaned = cleanJsonString(arrayMatch[0]);
        try {
            const parsed = JSON.parse(cleaned);
            if (Array.isArray(parsed)) return parsed as T[];
        } catch { /* continue */ }
    }

    // Strategy 4: Aggressive cleaning
    if (arrayMatch) {
        const aggressive = aggressiveClean(arrayMatch[0]);
        try {
            const parsed = JSON.parse(aggressive);
            if (Array.isArray(parsed)) return parsed as T[];
        } catch { /* continue */ }
    }

    // Strategy 5: Maybe it's wrapped in an object like { "items": [...] }
    const obj = safeParseJsonObject(text);
    if (obj) {
        const values = Object.values(obj);
        const firstArray = values.find(v => Array.isArray(v));
        if (firstArray) return firstArray as T[];
    }

    return null;
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════

function stripMarkdownFences(text: string): string {
    return text
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();
}

function cleanJsonString(text: string): string {
    return text
        // Remove JS-style comments
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        // Fix trailing commas (,} and ,])
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        // Remove any control characters that break JSON
        .replace(/[\x00-\x1F\x7F]/g, (char) => {
            // Keep \n, \r, \t as they're valid in JSON strings
            if (char === "\n" || char === "\r" || char === "\t") return char;
            return "";
        })
        .trim();
}

function aggressiveClean(text: string): string {
    let cleaned = cleanJsonString(text);

    // Fix single quotes to double quotes (common Gemini mistake)
    cleaned = fixQuotes(cleaned);

    // Fix unterminated strings by closing them
    cleaned = fixUnterminatedStrings(cleaned);

    return cleaned;
}

/**
 * Attempts to fix single-quoted JSON by converting to double quotes.
 * This is a best-effort operation — may not handle edge cases.
 */
function fixQuotes(text: string): string {
    // If it already parses, don't touch it
    try { JSON.parse(text); return text; } catch { /* continue */ }

    let result = "";
    let inString = false;
    let stringChar = "";

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const prevChar = i > 0 ? text[i - 1] : "";

        if (!inString) {
            if (char === "'" || char === '"') {
                inString = true;
                stringChar = char;
                result += '"';
            } else {
                result += char;
            }
        } else {
            if (char === stringChar && prevChar !== "\\") {
                inString = false;
                result += '"';
            } else if (char === '"' && stringChar === "'") {
                // Escape double quotes inside single-quoted strings
                result += '\\"';
            } else {
                result += char;
            }
        }
    }

    return result;
}

/**
 * Fix unterminated strings by closing them before the next structural character.
 */
function fixUnterminatedStrings(text: string): string {
    // Try parsing — if it works, text is fine
    try { JSON.parse(text); return text; } catch { /* continue */ }

    // Simple heuristic: count quotes. If odd number, add a closing quote
    const quoteCount = (text.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) {
        const lastQuoteIdx = text.lastIndexOf('"');
        const remaining = text.slice(lastQuoteIdx + 1);
        const structMatch = remaining.match(/[}\],]/);
        if (structMatch && structMatch.index !== undefined) {
            const insertAt = lastQuoteIdx + 1 + structMatch.index;
            text = text.slice(0, insertAt) + '"' + text.slice(insertAt);
        } else {
            text = text + '"';
        }
    }

    // Also try to balance brackets
    const openBrackets = (text.match(/\[/g) || []).length;
    const closeBrackets = (text.match(/]/g) || []).length;
    const openBraces = (text.match(/\{/g) || []).length;
    const closeBraces = (text.match(/}/g) || []).length;

    for (let i = 0; i < openBrackets - closeBrackets; i++) text += "]";
    for (let i = 0; i < openBraces - closeBraces; i++) text += "}";

    return text;
}
