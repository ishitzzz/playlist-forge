/**
 * 🎯 One-Shot Search — Exam Mode
 * 
 * Finds comprehensive "marathon" videos that cover an entire subject
 * in a single video. Bypasses the complex anchor/gap pipeline.
 * 
 * STRATEGY:
 *   1. Search for "[subject] one shot full course in [language]"
 *   2. Filter to MIN_DURATION = 45 minutes
 *   3. Rank by density
 *   4. Return 1-5 videos (covering major sections)
 */

import ytSearch from "yt-search";
import type { SyllabusData, PlaylistEntry } from "../core/types.js";
import { rankByDensity, filterByDuration, type VideoCandidate } from "../core/searchScraper.js";
import type { SearchModifiers } from "./preferences.js";

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

/** Minimum duration for one-shot videos (seconds) */
const ONE_SHOT_MIN_DURATION = 2700; // 45 minutes

/** Maximum results to return */
const MAX_ONE_SHOT_RESULTS = 5;

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

/**
 * Search for comprehensive one-shot videos covering the entire syllabus.
 */
export async function searchOneShot(
    syllabus: SyllabusData,
    modifiers: SearchModifiers
): Promise<PlaylistEntry[]> {
    const subject = syllabus.title;
    const queries = buildOneShotQueries(subject, modifiers);

    console.log(`🎯 One-Shot Search for "${subject}" with ${queries.length} queries`);

    // Collect candidates from all queries
    const allCandidates: VideoCandidate[] = [];
    const seenIds = new Set<string>();

    for (const query of queries) {
        try {
            console.log(`  🔍 Query: "${query}"`);
            const result = await ytSearch(query);

            for (const v of (result.videos || []).slice(0, 10)) {
                if (seenIds.has(v.videoId)) continue;
                seenIds.add(v.videoId);

                allCandidates.push({
                    videoId: v.videoId,
                    title: v.title,
                    description: v.description || "",
                    duration: {
                        seconds: v.duration?.seconds || 0,
                        timestamp: v.duration?.timestamp || "0:00",
                    },
                    views: v.views || 0,
                    author: {
                        name: v.author?.name || "Unknown",
                        url: v.author?.url,
                    },
                });
            }
        } catch (error) {
            console.warn(`  ⚠️ Query failed: "${query}"`, error);
        }
    }

    console.log(`  📊 Collected ${allCandidates.length} unique candidates`);

    // Filter to long videos only
    const longVideos = filterByDuration(allCandidates, ONE_SHOT_MIN_DURATION);

    if (longVideos.length === 0) {
        console.warn("  ⚠️ No videos >= 45 min found. Relaxing to 20 min minimum...");
        const relaxed = filterByDuration(allCandidates, 1200); // 20 min
        if (relaxed.length === 0) {
            console.error("  ❌ No suitable one-shot videos found at all.");
            return [];
        }
        return formatResults(rankByDensity(relaxed), subject, MAX_ONE_SHOT_RESULTS);
    }

    // Rank by density
    const ranked = rankByDensity(longVideos);

    return formatResults(ranked, subject, MAX_ONE_SHOT_RESULTS);
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL
// ═══════════════════════════════════════════════════════════════

function buildOneShotQueries(subject: string, modifiers: SearchModifiers): string[] {
    const lang = modifiers.languageSuffix;

    return [
        `${subject} one shot full course ${lang}`.trim(),
        `${subject} complete revision in one video ${lang}`.trim(),
        `${subject} full course marathon ${lang}`.trim(),
    ];
}

function formatResults(
    ranked: VideoCandidate[],
    subject: string,
    maxResults: number
): PlaylistEntry[] {
    return ranked.slice(0, maxResults).map((v, i) => ({
        position: i,
        videoId: v.videoId,
        title: v.title,
        channelName: v.author.name,
        durationSeconds: v.duration.seconds,
        durationDisplay: v.duration.timestamp,
        topicMatched: subject,
        source: "one_shot" as const,
    }));
}
