/**
 * 🧠 Query Intelligence — 3-Layer Meaning Extraction
 * 
 * Copied from Dojo: src/utils/queryIntelligence.ts
 * No modifications needed — this file has no internal imports.
 * 
 * Deterministic query understanding system. Zero AI calls.
 * 
 * LAYER 1: Meaning Extractor → Strips noise, extracts subjects + intent
 * LAYER 2: Query Builder     → Constructs optimized YouTube queries  
 * LAYER 3: Relevance Guard   → Post-search validation bouncer
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ExtractedMeaning {
    /** Core subjects/nouns the user cares about */
    subjects: string[];
    /** The action or relationship (e.g., "trade", "build", "understand") */
    action: string | null;
    /** Temporal context if detected (e.g., "ancient", "modern", "2024") */
    timeframe: string | null;
    /** What the user wants to DO (learn_skill, understand_concept, explore_topic, build_project) */
    intent: Intent;
    /** The cleaned, meaningful query without noise */
    cleanedQuery: string;
    /** Content type preference derived from intent + context */
    contentType: ContentType;
}

export type Intent =
    | "learn_skill"        // "learn React", "how to cook"
    | "understand_concept" // "what is quantum physics", "explain DNA"
    | "explore_topic"      // "ancient rome", "history of jazz"
    | "build_project"      // "build a website", "create an app"
    | "solve_problem";     // "fix memory leak", "debug CSS"

export type ContentType =
    | "tutorial"      // Step-by-step guide
    | "explanation"   // Conceptual overview
    | "documentary"   // Deep narrative exploration
    | "lecture"       // Academic/formal
    | "demonstration" // Show-and-do
    | "overview";     // General introduction

export interface RelevanceResult {
    isRelevant: boolean;
    score: number;          // 0-100
    matchedSubjects: string[];
    reason: string;
}

export interface SmartQuery {
    primary: string;    // Best query to try first
    fallback: string;   // Simpler fallback
    subjects: string[]; // For relevance guard
}

// ═══════════════════════════════════════════════════════════════
// LAYER 1: MEANING EXTRACTOR
// ═══════════════════════════════════════════════════════════════

/** Words that carry zero meaning for search */
const STOP_WORDS = new Set([
    // Articles & Prepositions
    "a", "an", "the", "of", "in", "on", "at", "to", "for", "with",
    "by", "from", "up", "about", "into", "through", "during", "before",
    "after", "above", "below", "between", "under", "over",
    // Conjunctions
    "and", "but", "or", "nor", "so", "yet",
    // Pronouns
    "i", "me", "my", "we", "us", "our", "you", "your", "he", "she",
    "it", "they", "them", "their", "this", "that", "these", "those",
    // Common verbs (that aren't the ACTION)
    "is", "are", "was", "were", "be", "been", "being", "have", "had",
    "has", "do", "does", "did", "will", "would", "could", "should",
    "may", "might", "shall", "can", "need", "must",
    // Filler
    "very", "really", "just", "also", "like", "want", "please",
    "help", "know", "get", "got", "let", "thing", "stuff", "something",
    // Question words (intent signals, not subjects)
    "how", "what", "why", "when", "where", "which", "who",
]);

/** Words that signal INTENT */
const INTENT_SIGNALS: Record<Intent, string[]> = {
    learn_skill: ["learn", "tutorial", "course", "teach", "training", "master", "practice", "beginner", "start"],
    understand_concept: ["understand", "explain", "concept", "theory", "meaning", "definition", "what", "why"],
    explore_topic: ["history", "evolution", "story", "journey", "culture", "civilization", "era", "age", "period", "ancient", "modern"],
    build_project: ["build", "create", "make", "develop", "implement", "code", "program", "design", "project", "app"],
    solve_problem: ["fix", "solve", "debug", "error", "issue", "problem", "troubleshoot", "broken", "crash"],
};

/** Words that signal TIMEFRAME */
const TIMEFRAME_SIGNALS: Record<string, string[]> = {
    ancient: ["ancient", "prehistoric", "classical", "antiquity", "bc", "bce", "old", "medieval", "middle ages"],
    modern: ["modern", "contemporary", "current", "today", "2024", "2025", "2026", "latest", "new", "recent"],
    historical: ["history", "historical", "century", "era", "age", "period", "dynasty", "empire", "kingdom"],
};

/** Words that signal ACTION/RELATIONSHIP */
const ACTION_WORDS = new Set([
    "trade", "build", "create", "design", "fight", "conquer", "discover",
    "invent", "cook", "paint", "compose", "write", "calculate", "analyze",
    "compare", "migrate", "evolve", "grow", "shrink", "collapse", "rise",
    "fall", "spread", "connect", "separate", "merge", "split",
]);

/**
 * LAYER 1: Extract meaning from raw user query.
 * No AI. Pure deterministic text analysis.
 */
export function extractMeaning(rawQuery: string): ExtractedMeaning {
    const normalized = rawQuery.toLowerCase().trim();
    const words = normalized.split(/\s+/).filter(w => w.length > 1);

    // 1. Detect Intent
    let intent: Intent = "understand_concept"; // default
    let maxIntentScore = 0;

    for (const [intentKey, signals] of Object.entries(INTENT_SIGNALS)) {
        const score = signals.filter(s => normalized.includes(s)).length;
        if (score > maxIntentScore) {
            maxIntentScore = score;
            intent = intentKey as Intent;
        }
    }

    // 2. Detect Timeframe
    let timeframe: string | null = null;
    for (const [tf, signals] of Object.entries(TIMEFRAME_SIGNALS)) {
        if (signals.some(s => normalized.includes(s))) {
            timeframe = tf;
            break;
        }
    }

    // 3. Extract Action
    let action: string | null = null;
    for (const word of words) {
        if (ACTION_WORDS.has(word)) {
            action = word;
            break;
        }
    }

    // 4. Extract Subjects (everything that isn't a stop word or intent signal)
    const subjects = words.filter(word => {
        if (STOP_WORDS.has(word)) return false;
        return true;
    }).filter(word => {
        const pureIntentWords = new Set(["learn", "understand", "explain", "build", "create", "teach", "fix", "solve", "debug", "start", "make"]);
        return !pureIntentWords.has(word);
    });

    // 5. Build cleaned query (subjects + action, no noise)
    const cleanedParts = [...new Set(subjects)];
    const cleanedQuery = cleanedParts.join(" ");

    // 6. Determine content type from intent + timeframe
    const contentType = deriveContentType(intent, timeframe);

    return {
        subjects: [...new Set(subjects)],
        action,
        timeframe,
        intent,
        cleanedQuery,
        contentType,
    };
}

/** Map intent + context signals to preferred content type */
function deriveContentType(intent: Intent, timeframe: string | null): ContentType {
    if (timeframe === "ancient" || timeframe === "historical") return "documentary";

    switch (intent) {
        case "learn_skill": return "tutorial";
        case "build_project": return "demonstration";
        case "solve_problem": return "tutorial";
        case "explore_topic": return timeframe ? "documentary" : "overview";
        case "understand_concept": return "explanation";
        default: return "overview";
    }
}


// ═══════════════════════════════════════════════════════════════
// LAYER 2: QUERY BUILDER
// ═══════════════════════════════════════════════════════════════

/** Content type → YouTube-friendly suffix */
const CONTENT_SUFFIXES: Record<ContentType, string> = {
    tutorial: "tutorial guide",
    explanation: "explained overview",
    documentary: "documentary",
    lecture: "lecture course",
    demonstration: "project walkthrough",
    overview: "introduction overview",
};

/**
 * LAYER 2: Build optimized YouTube search queries from extracted meaning.
 * Returns a primary query and a simpler fallback.
 */
export function buildSmartQuery(meaning: ExtractedMeaning, modifier?: string): SmartQuery {
    const { subjects, contentType, cleanedQuery } = meaning;

    // Apply modifier overrides
    let suffix = CONTENT_SUFFIXES[contentType];
    if (modifier === "detailed") suffix = "full course deep dive";
    else if (modifier === "practical") suffix = "hands-on project build";
    else if (modifier === "short") suffix = "explained quickly";

    // Primary: cleaned query + content-appropriate suffix  
    const primary = `${cleanedQuery} ${suffix}`.trim();

    // Fallback: just the core subjects, no suffix
    const fallback = subjects.slice(0, 3).join(" ");

    return {
        primary,
        fallback,
        subjects,
    };
}


// ═══════════════════════════════════════════════════════════════
// LAYER 3: RELEVANCE GUARD (The Bouncer)
// ═══════════════════════════════════════════════════════════════

/**
 * LAYER 3: Check if a video title/description is relevant to extracted subjects.
 * Returns a score from 0-100 and whether it passes the threshold.
 */
export function checkRelevance(
    title: string,
    description: string,
    subjects: string[],
    threshold: number = 30
): RelevanceResult {
    if (subjects.length === 0) {
        return { isRelevant: true, score: 50, matchedSubjects: [], reason: "No subjects to validate against" };
    }

    const titleLower = title.toLowerCase();
    const descLower = (description || "").toLowerCase().slice(0, 500);
    const combined = `${titleLower} ${descLower}`;

    const matchedSubjects: string[] = [];
    let score = 0;

    for (const subject of subjects) {
        // Exact match in title (highest value)
        if (titleLower.includes(subject)) {
            score += 30;
            matchedSubjects.push(subject);
        }
        // Match in description (moderate value)
        else if (descLower.includes(subject)) {
            score += 15;
            matchedSubjects.push(subject);
        }
        // Partial/stem match (e.g., "trading" matches "trade")
        else if (combined.includes(subject.slice(0, -1))) {
            score += 10;
            matchedSubjects.push(`~${subject}`);
        }
    }

    // Normalize: cap at 100
    score = Math.min(100, score);

    // Bonus: if >50% of subjects match, boost
    const matchRatio = matchedSubjects.length / subjects.length;
    if (matchRatio >= 0.5) score = Math.min(100, score + 15);

    const isRelevant = score >= threshold;

    return {
        isRelevant,
        score,
        matchedSubjects,
        reason: isRelevant
            ? `Passed: ${matchedSubjects.length}/${subjects.length} subjects found (score: ${score})`
            : `REJECTED: Only ${matchedSubjects.length}/${subjects.length} subjects found (score: ${score} < ${threshold})`,
    };
}

/**
 * Filter an array of video candidates using the Relevance Guard.
 * Returns only relevant videos. If none pass, returns the best-scoring ones.
 */
export function filterByRelevance(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    videos: any[],
    subjects: string[],
    threshold: number = 30
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): { passed: any[]; bestEffort: any[] } {
    if (subjects.length === 0 || videos.length === 0) {
        return { passed: videos, bestEffort: videos };
    }

    const scored = videos.map(v => ({
        video: v,
        relevance: checkRelevance(
            v.title || "",
            v.description || "",
            subjects,
            threshold
        ),
    }));

    const passed = scored
        .filter(s => s.relevance.isRelevant)
        .map(s => s.video);

    // Sort by score for best-effort fallback
    const bestEffort = scored
        .sort((a, b) => b.relevance.score - a.relevance.score)
        .slice(0, 5)
        .map(s => s.video);

    if (passed.length > 0) {
        console.log(`🛡️ Relevance Guard: ${passed.length}/${videos.length} passed (threshold: ${threshold})`);
    } else {
        console.warn(`⚠️ Relevance Guard: 0/${videos.length} passed! Using best-effort top 5.`);
    }

    return { passed, bestEffort };
}


// ═══════════════════════════════════════════════════════════════
// CONVENIENCE: Full Pipeline
// ═══════════════════════════════════════════════════════════════

/**
 * Run the full 3-layer pipeline on a raw query.
 * Returns everything needed for an intelligent search.
 */
export function analyzeQuery(rawQuery: string, modifier?: string): {
    meaning: ExtractedMeaning;
    smartQuery: SmartQuery;
} {
    const meaning = extractMeaning(rawQuery);
    const smartQuery = buildSmartQuery(meaning, modifier);

    console.log(`🧠 Query Intelligence:`, {
        raw: rawQuery,
        subjects: meaning.subjects,
        intent: meaning.intent,
        contentType: meaning.contentType,
        timeframe: meaning.timeframe,
        primaryQuery: smartQuery.primary,
    });

    return { meaning, smartQuery };
}
