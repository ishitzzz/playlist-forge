/**
 * ⚙️ Preferences Engine
 * 
 * Maps user preferences into concrete search parameters.
 * Zero API calls — pure configuration logic.
 */

import {
    UserPreferences,
    StudentType,
    Language,
    LearningMode,
    DurationConfig,
    DURATION_CONFIGS,
    LANGUAGE_SUFFIXES,
    STUDENT_EXPERIENCE_MAP,
} from "../core/types.js";

// ═══════════════════════════════════════════════════════════════
// SEARCH MODIFIERS (derived from preferences)
// ═══════════════════════════════════════════════════════════════

export interface SearchModifiers {
    /** Suffix appended to all queries, e.g. "in Hindi" */
    languageSuffix: string;
    /** Experience level for the reranker, e.g. "intermediate" */
    experienceLevel: string;
    /** Duration constraints */
    duration: DurationConfig;
    /** Learning mode label (for logging) */
    modeLabel: string;
    /** Extra keywords for the search query */
    modeKeywords: string;
}

/**
 * Converts raw user preferences into concrete search modifiers.
 */
export function resolvePreferences(prefs: UserPreferences): SearchModifiers {
    const languageSuffix = LANGUAGE_SUFFIXES[prefs.language];
    const experienceLevel = STUDENT_EXPERIENCE_MAP[prefs.studentType];
    const duration = DURATION_CONFIGS[prefs.learningMode];

    // Mode-specific search keyword boosts
    let modeKeywords = "";
    let modeLabel = "";

    switch (prefs.learningMode) {
        case "from_scratch":
            modeKeywords = "explained fundamentals concepts from basics";
            modeLabel = "🧱 From Scratch (First Principles)";
            break;
        case "revision":
            modeKeywords = "quick revision recap summary";
            modeLabel = "📝 Revision (Quick Recap)";
            break;
        case "one_shot":
            modeKeywords = "one shot full course complete revision in one video";
            modeLabel = "🎯 One-Shot (Exam Mode)";
            break;
    }

    return {
        languageSuffix,
        experienceLevel,
        duration,
        modeLabel,
        modeKeywords,
    };
}

/**
 * Build a search query enhanced with user preferences.
 */
export function buildPreferenceQuery(
    topic: string,
    modifiers: SearchModifiers
): string {
    const parts = [
        topic,
        modifiers.modeKeywords,
        modifiers.languageSuffix,
    ].filter(Boolean);

    return parts.join(" ").trim();
}

/**
 * Build a one-shot exam mode query.
 * Searches specifically for comprehensive marathon videos.
 */
export function buildOneShotQuery(
    subject: string,
    modifiers: SearchModifiers
): string {
    const parts = [
        subject,
        "one shot",
        "full course",
        "complete revision in one video",
        modifiers.languageSuffix,
    ].filter(Boolean);

    return parts.join(" ").trim();
}

/**
 * Default preferences for when no user config exists.
 */
export function getDefaultPreferences(): UserPreferences {
    return {
        studentType: "undergrad",
        language: "english",
        learningMode: "from_scratch",
    };
}

/**
 * Validate that preferences are valid.
 */
export function validatePreferences(prefs: Partial<UserPreferences>): UserPreferences {
    const validStudentTypes: StudentType[] = ["high_school", "undergrad", "post_grad"];
    const validLanguages: Language[] = ["english", "hindi"];
    const validModes: LearningMode[] = ["from_scratch", "revision", "one_shot"];

    return {
        studentType: validStudentTypes.includes(prefs.studentType as StudentType)
            ? (prefs.studentType as StudentType)
            : "undergrad",
        language: validLanguages.includes(prefs.language as Language)
            ? (prefs.language as Language)
            : "english",
        learningMode: validModes.includes(prefs.learningMode as LearningMode)
            ? (prefs.learningMode as LearningMode)
            : "from_scratch",
    };
}
