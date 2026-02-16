/**
 * 🎯 Playlist Forge — Shared Types
 * 
 * Central type definitions for the entire playlist-forge engine.
 * All modules import from here for consistency.
 */

// ═══════════════════════════════════════════════════════════════
// USER PREFERENCES
// ═══════════════════════════════════════════════════════════════

export type StudentType = "high_school" | "undergrad" | "post_grad";
export type Language = "english" | "hindi";
export type LearningMode = "from_scratch" | "revision" | "one_shot";

export interface UserPreferences {
    studentType: StudentType;
    language: Language;
    learningMode: LearningMode;
}

// ═══════════════════════════════════════════════════════════════
// SYLLABUS DATA
// ═══════════════════════════════════════════════════════════════

export interface SyllabusTopic {
    title: string;
    subtopics?: string[];
}

export interface SyllabusModule {
    moduleTitle: string;
    topics: string[];
}

export interface SyllabusData {
    title: string;
    description: string;
    fundamentalConcept?: string;       // For "from_scratch" mode — goes to index 0
    tableOfContents: string[];          // Flat ordered list of all topics
    modules: SyllabusModule[];          // Structured module breakdown
}

// ═══════════════════════════════════════════════════════════════
// PLAYLIST ENTRIES
// ═══════════════════════════════════════════════════════════════

export type VideoSource =
    | "anchor_playlist"     // From a matched YouTube playlist
    | "gap_fill"            // Individually searched to fill a gap
    | "one_shot"            // Single comprehensive video (exam mode)
    | "first_principle";    // Prepended fundamental concept video

export interface PlaylistEntry {
    position: number;           // 0-indexed position in final playlist
    videoId: string;
    title: string;
    channelName: string;
    durationSeconds: number;
    durationDisplay: string;    // e.g., "15:32"
    topicMatched: string;       // Which TOC item this covers
    source: VideoSource;
}

// ═══════════════════════════════════════════════════════════════
// ANCHOR PLAYLIST
// ═══════════════════════════════════════════════════════════════

export interface AnchorPlaylist {
    playlistId: string;
    playlistTitle: string;
    channelName: string;
    videoCount: number;
    videos: AnchorVideo[];
    coverageScore: number;      // 0-100: % of TOC items matched
    matchedTopics: string[];    // TOC items that have a match
    unmatchedTopics: string[];  // TOC items that are "gaps"
}

export interface AnchorVideo {
    videoId: string;
    title: string;
    durationSeconds: number;
    durationDisplay: string;
    position: number;           // Position within the original playlist
}

// ═══════════════════════════════════════════════════════════════
// PLAYLIST RESULT (Final Output)
// ═══════════════════════════════════════════════════════════════

export interface PlaylistResult {
    syllabusTitle: string;
    totalVideos: number;
    totalDurationMinutes: number;
    entries: PlaylistEntry[];
    watchUrl: string;                    // YouTube watch_videos URL
    anchor?: {
        channelName: string;
        playlistTitle: string;
        coverageScore: number;
    };
    preferences: UserPreferences;
    generatedAt: string;                 // ISO timestamp
}

// ═══════════════════════════════════════════════════════════════
// DURATION CONFIGS (per learning mode)
// ═══════════════════════════════════════════════════════════════

export interface DurationConfig {
    minSeconds: number;
    maxSeconds: number;
    targetPerTopic: string;             // Human-readable, e.g., "15-45 min"
}

export const DURATION_CONFIGS: Record<LearningMode, DurationConfig> = {
    from_scratch: {
        minSeconds: 600,       // 10 min minimum
        maxSeconds: 2700,      // 45 min max per topic
        targetPerTopic: "15-45 min",
    },
    revision: {
        minSeconds: 180,       // 3 min minimum
        maxSeconds: 900,       // 15 min max per topic
        targetPerTopic: "5-15 min",
    },
    one_shot: {
        minSeconds: 2700,      // 45 min minimum (comprehensive)
        maxSeconds: 10800,     // 3 hours max
        targetPerTopic: "45-90 min total",
    },
};

// ═══════════════════════════════════════════════════════════════
// LANGUAGE CONFIG
// ═══════════════════════════════════════════════════════════════

export const LANGUAGE_SUFFIXES: Record<Language, string> = {
    english: "",
    hindi: "in Hindi",
};

// ═══════════════════════════════════════════════════════════════
// STUDENT TYPE → EXPERIENCE LEVEL MAPPING
// ═══════════════════════════════════════════════════════════════

export const STUDENT_EXPERIENCE_MAP: Record<StudentType, string> = {
    high_school: "beginner",
    undergrad: "intermediate",
    post_grad: "advanced",
};
