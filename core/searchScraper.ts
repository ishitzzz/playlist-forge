/**
 * 🔍 Search Scraper Utilities
 * Implements the "Information Density" scoring system for YouTube videos.
 * Philosophy: Technical depth over popularity.
 * 
 * Copied from Dojo: src/utils/searchScraper.ts
 * No modifications needed — this file has no internal imports.
 */

export interface VideoCandidate {
    videoId: string;
    title: string;
    description: string;
    duration: {
        seconds: number;
        timestamp: string;
    };
    views: number;
    author: {
        name: string;
        url?: string;
    };
    densityScore?: number;
    densityFlags?: string[];
    // API Enriched Fields
    tags?: string[];
    category?: string;
    officialTopics?: string[];
    channelId?: string;
    likeCount?: number;
    commentCount?: number;
    transcriptSnippet?: string;
}

export interface SearchQuery {
    type: "conceptual" | "implementation" | "troubleshooting";
    query: string;
}

// ═══════════════════════════════════════════════════════════════
// WEIGHTS FOR DENSITY SCORING
// ═══════════════════════════════════════════════════════════════
const WEIGHTS = {
    GITHUB_BOOST: 50,           // +50 for GitHub/Colab links
    LONG_VIDEO_BOOST: 30,       // +30 for videos > 15 minutes
    MEDIUM_VIDEO_BOOST: 15,     // +15 for videos 10-15 minutes
    DOCUMENTATION_BOOST: 25,    // +25 for documentation keywords
    ACADEMIC_BOOST: 20,         // +20 for academic/research terms
    EMPTY_DESC_PENALTY: -40,    // -40 for high-view videos with empty descriptions
    HIGH_VIEW_PENALTY_THRESHOLD: 500000,
    CLICKBAIT_PENALTY: -100,    // Heavy penalty for clickbait signals
};

// Keywords that signal high-quality technical content
const QUALITY_SIGNALS = {
    github: ["github.com", "github.io", "gitlab.com", "bitbucket.org"],
    colab: ["colab.research.google.com", "kaggle.com/code", "jupyter"],
    documentation: ["documentation", "docs", "api reference", "readme", "implementation"],
    academic: ["paper", "research", "arxiv", "whitepaper", "thesis", "algorithm"],
    technical: ["source code", "repository", "npm", "pip install", "docker"],
};

// Signals that indicate clickbait or low-density content
const CLICKBAIT_SIGNALS = [
    "mind-blowing",
    "you won't believe",
    "insane",
    "crazy",
    "!! ",
    "🔥🔥🔥",
    "secrets revealed",
    "changed my life",
    "in just 5 minutes",
    "watch this before",
    "nobody tells you",
];

/**
 * Calculate the Information Density Score for a video
 * Higher score = better technical content likelihood
 */
export function calculateDensityScore(video: VideoCandidate): {
    score: number;
    flags: string[];
} {
    let score = 0;
    const flags: string[] = [];
    const descLower = video.description.toLowerCase();
    const titleLower = video.title.toLowerCase();

    // ═══════════════════════════════════════════════════════════════
    // POSITIVE SIGNALS
    // ═══════════════════════════════════════════════════════════════

    // GitHub/Colab presence (strongest signal)
    for (const signal of QUALITY_SIGNALS.github) {
        if (descLower.includes(signal)) {
            score += WEIGHTS.GITHUB_BOOST;
            flags.push("🔗 GitHub Link");
            break;
        }
    }

    for (const signal of QUALITY_SIGNALS.colab) {
        if (descLower.includes(signal)) {
            score += WEIGHTS.GITHUB_BOOST;
            flags.push("📓 Notebook Link");
            break;
        }
    }

    // Documentation keywords
    for (const keyword of QUALITY_SIGNALS.documentation) {
        if (descLower.includes(keyword) || titleLower.includes(keyword)) {
            score += WEIGHTS.DOCUMENTATION_BOOST;
            flags.push("📚 Documentation");
            break;
        }
    }

    // Academic/Research terms
    for (const keyword of QUALITY_SIGNALS.academic) {
        if (descLower.includes(keyword) || titleLower.includes(keyword)) {
            score += WEIGHTS.ACADEMIC_BOOST;
            flags.push("🎓 Academic");
            break;
        }
    }

    // Technical depth indicators
    for (const keyword of QUALITY_SIGNALS.technical) {
        if (descLower.includes(keyword)) {
            score += 15;
            flags.push("⚙️ Technical");
            break;
        }
    }

    // Duration scoring
    if (video.duration.seconds > 900) {
        // > 15 minutes
        score += WEIGHTS.LONG_VIDEO_BOOST;
        flags.push("⏱️ Deep Dive (15+ min)");
    } else if (video.duration.seconds > 600) {
        // 10-15 minutes
        score += WEIGHTS.MEDIUM_VIDEO_BOOST;
        flags.push("⏱️ Detailed (10-15 min)");
    }

    // ═══════════════════════════════════════════════════════════════
    // NEGATIVE SIGNALS (Penalties)
    // ═══════════════════════════════════════════════════════════════

    // Clickbait detection
    for (const signal of CLICKBAIT_SIGNALS) {
        if (descLower.includes(signal) || titleLower.includes(signal)) {
            score += WEIGHTS.CLICKBAIT_PENALTY;
            flags.push("⚠️ Clickbait Signal");
            break;
        }
    }

    // High views + empty/short description = likely clickbait
    if (
        video.views > WEIGHTS.HIGH_VIEW_PENALTY_THRESHOLD &&
        video.description.length < 100
    ) {
        score += WEIGHTS.EMPTY_DESC_PENALTY;
        flags.push("⚠️ High Views, Low Info");
    }

    // All caps title = aggressive marketing
    const capsRatio =
        (video.title.match(/[A-Z]/g) || []).length / video.title.length;
    if (capsRatio > 0.5 && video.title.length > 10) {
        score -= 20;
        flags.push("⚠️ Aggressive Title");
    }

    return { score, flags };
}

/**
 * Sort videos by density score (descending)
 */
export function rankByDensity(videos: VideoCandidate[]): VideoCandidate[] {
    return videos
        .map((v) => {
            const { score, flags } = calculateDensityScore(v);
            return { ...v, densityScore: score, densityFlags: flags };
        })
        .sort((a, b) => (b.densityScore || 0) - (a.densityScore || 0));
}

/**
 * Generate the Search Matrix - 3 diverse queries for comprehensive coverage
 */
export function generateSearchMatrix(
    topic: string,
    userRole: string,
    experienceLevel: string
): SearchQuery[] {
    const antiClickbait = "-clickbait -giveaway -reaction -shorts";

    // Role-based modifiers
    let roleModifier = "";
    if (userRole === "Student") {
        roleModifier = "tutorial explained step by step";
    } else if (userRole === "Professional") {
        roleModifier = "production architecture best practices";
    } else if (userRole === "Founder") {
        roleModifier = "MVP implementation business";
    }

    // Experience-based modifiers
    let experienceModifier = "";
    if (experienceLevel === "Deep Dive") {
        experienceModifier = "comprehensive documentation whitepaper";
    } else if (experienceLevel === "Project Based") {
        experienceModifier = "build project github source code";
    } else {
        experienceModifier = "introduction basics";
    }

    const queries: SearchQuery[] = [
        {
            type: "conceptual",
            query: `${topic} ${experienceModifier} mathematical foundation theory ${antiClickbait}`,
        },
        {
            type: "implementation",
            query: `${topic} implementation ${roleModifier} github source code ${antiClickbait}`,
        },
        {
            type: "troubleshooting",
            query: `${topic} common mistakes pitfalls architecture ${roleModifier} ${antiClickbait}`,
        },
    ];

    return queries;
}

/**
 * Filter videos by minimum duration threshold
 */
export function filterByDuration(
    videos: VideoCandidate[],
    minSeconds: number = 120
): VideoCandidate[] {
    return videos.filter((v) => v.duration.seconds >= minSeconds);
}

/**
 * Prepare video metadata for LLM reranking
 */
export function prepareForLLMRerank(videos: VideoCandidate[]): string {
    return videos
        .slice(0, 5)
        .map((v, i) => {
            const descPreview = v.description.slice(0, 200).replace(/\n/g, " ");

            let extraSignals = "";
            if (v.officialTopics && v.officialTopics.length > 0) {
                extraSignals += `\nOfficial Topics: ${v.officialTopics.join(", ")}`;
            }
            if (v.category) {
                extraSignals += `\nCategory: ${v.category}`;
            }
            if (v.tags && v.tags.length > 0) {
                extraSignals += `\nTags: ${v.tags.slice(0, 8).join(", ")}`;
            }
            if (v.likeCount && v.views > 0) {
                const likeRatio = ((v.likeCount / v.views) * 100).toFixed(2);
                extraSignals += `\nEngagement: ${likeRatio}% likes (${v.likeCount} likes)`;
            }
            if (v.transcriptSnippet) {
                extraSignals += `\nTranscript Intro (First 60s): "${v.transcriptSnippet.slice(0, 300)}..."`;
            }

            return `[${i + 1}] ID: ${v.videoId}
Title: ${v.title}
Channel: ${v.author.name}
Duration: ${v.duration.timestamp}
Description: ${descPreview}...
Density Flags: ${v.densityFlags?.join(", ") || "None"}${extraSignals}`;
        })
        .join("\n\n");
}
