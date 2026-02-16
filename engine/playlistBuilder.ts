/**
 * 🏗️ Playlist Builder — The Orchestrator
 * 
 * Ties everything together. Entry point for the entire playlist-forge engine.
 * 
 * PIPELINE:
 *   1. Extract TOC from syllabus screenshot (syllabusExtractor)
 *   2. Resolve user preferences → search modifiers (preferences)
 *   3. IF one-shot mode → short-circuit with single search
 *   4. ELSE → hunt for anchor playlist (anchorHunter)
 *   5. IF anchor found → fill gaps (gapFiller)
 *   6. ELSE → build from scratch (gapFiller.buildFromScratch)
 *   7. Generate export URL (exportPlaylist)
 *   8. Return PlaylistResult
 * 
 * API CALLS (total):
 *   - 1 Gemini call (syllabus OCR)
 *   - 1-5 yt-search calls (free, anchor hunting)
 *   - 0-N yt-search calls (free, gap filling)
 *   - 0-N Gemini calls (optional reranking)
 */

import type {
    UserPreferences,
    SyllabusData,
    PlaylistResult,
    PlaylistEntry,
} from "../core/types.js";
import { extractSyllabus, extractSyllabusFromText } from "./syllabusExtractor.js";
import { resolvePreferences, getDefaultPreferences, validatePreferences } from "./preferences.js";
import { huntForAnchor } from "./anchorHunter.js";
import { fillGaps, buildFromScratch } from "./gapFiller.js";
import { toWatchURL, generateSummary } from "./exportPlaylist.js";
import { searchOneShot } from "./oneShotSearch.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface BuildOptions {
    /** User preferences (student type, language, learning mode) */
    preferences?: Partial<UserPreferences>;
    /** Skip anchor hunting and always build from scratch */
    skipAnchorSearch?: boolean;
    /** Skip Gemini reranking (faster, slightly lower quality) */
    skipReranker?: boolean;
}

export interface BuildFromImageOptions extends BuildOptions {
    /** Raw image/PDF buffer */
    imageBuffer: Buffer;
    /** MIME type of the file */
    mimeType: string;
}

export interface BuildFromTextOptions extends BuildOptions {
    /** Raw syllabus text */
    syllabusText: string;
}

export interface BuildFromTOCOptions extends BuildOptions {
    /** Pre-extracted syllabus data */
    syllabus: SyllabusData;
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API: Image → Playlist
// ═══════════════════════════════════════════════════════════════

/**
 * Full pipeline: Image → TOC → Playlist
 */
export async function buildPlaylistFromImage(
    options: BuildFromImageOptions
): Promise<PlaylistResult> {
    const prefs = validatePreferences(options.preferences || getDefaultPreferences());
    const modifiers = resolvePreferences(prefs);

    console.log(`\n🏗️ Playlist Builder starting (${modifiers.modeLabel})\n`);

    // Step 1: Extract syllabus from image
    const extraction = await extractSyllabus(
        options.imageBuffer,
        options.mimeType,
        prefs.learningMode
    );

    if (!extraction.success || !extraction.data) {
        throw new Error(`Syllabus extraction failed: ${extraction.error}`);
    }

    return buildPlaylistFromSyllabus({
        syllabus: extraction.data,
        preferences: prefs,
        skipAnchorSearch: options.skipAnchorSearch,
        skipReranker: options.skipReranker,
    });
}

/**
 * Full pipeline: Text → TOC → Playlist
 */
export async function buildPlaylistFromText(
    options: BuildFromTextOptions
): Promise<PlaylistResult> {
    const prefs = validatePreferences(options.preferences || getDefaultPreferences());
    const modifiers = resolvePreferences(prefs);

    console.log(`\n🏗️ Playlist Builder starting (${modifiers.modeLabel})\n`);

    const extraction = await extractSyllabusFromText(
        options.syllabusText,
        prefs.learningMode
    );

    if (!extraction.success || !extraction.data) {
        throw new Error(`Syllabus extraction failed: ${extraction.error}`);
    }

    return buildPlaylistFromSyllabus({
        syllabus: extraction.data,
        preferences: prefs,
        skipAnchorSearch: options.skipAnchorSearch,
        skipReranker: options.skipReranker,
    });
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API: TOC → Playlist (skip OCR step)
// ═══════════════════════════════════════════════════════════════

/**
 * Build playlist from pre-extracted syllabus data.
 * Use this when you already have the TOC (e.g., from a previous extraction).
 */
export async function buildPlaylistFromSyllabus(
    options: BuildFromTOCOptions
): Promise<PlaylistResult> {
    const prefs = validatePreferences(options.preferences || getDefaultPreferences());
    const modifiers = resolvePreferences(prefs);
    const { syllabus } = options;

    console.log(`📚 Subject: "${syllabus.title}"`);
    console.log(`📋 TOC: ${syllabus.tableOfContents.length} topics`);
    console.log(`⚙️  Mode: ${modifiers.modeLabel}`);
    console.log("");

    // ─────────────────────────────────────────────────────────
    // ONE-SHOT SHORT-CIRCUIT
    // ─────────────────────────────────────────────────────────
    if (prefs.learningMode === "one_shot") {
        return handleOneShotMode(syllabus, prefs, modifiers);
    }

    // ─────────────────────────────────────────────────────────
    // NORMAL FLOW: Anchor Hunt → Gap Fill → Sequence
    // ─────────────────────────────────────────────────────────
    let entries: PlaylistEntry[];
    let anchorInfo: PlaylistResult["anchor"] | undefined;

    if (!options.skipAnchorSearch) {
        // Step 2: Hunt for anchor playlist
        const anchorResult = await huntForAnchor(
            syllabus.title,
            syllabus.tableOfContents,
            modifiers.languageSuffix
        );

        if (anchorResult.found && anchorResult.anchor) {
            // Step 3a: Anchor found — fill gaps
            console.log(`\n✅ Anchor found! Filling ${anchorResult.anchor.unmatchedTopics.length} gaps...\n`);

            const gapResult = await fillGaps(
                anchorResult.anchor,
                syllabus.tableOfContents,
                syllabus.title,
                modifiers
            );

            entries = gapResult.entries;
            anchorInfo = {
                channelName: anchorResult.anchor.channelName,
                playlistTitle: anchorResult.anchor.playlistTitle,
                coverageScore: anchorResult.anchor.coverageScore,
            };

            if (gapResult.gapsFailed.length > 0) {
                console.warn(`⚠️ ${gapResult.gapsFailed.length} topics couldn't be filled:`, gapResult.gapsFailed);
            }
        } else {
            // Step 3b: No anchor — build from scratch
            console.log("\n📭 No anchor found. Building from scratch...\n");
            const scratchResult = await buildFromScratch(
                syllabus.tableOfContents,
                syllabus.title,
                modifiers
            );
            entries = scratchResult.entries;
        }
    } else {
        // Skip anchor entirely
        console.log("\n⏩ Anchor search skipped. Building from scratch...\n");
        const scratchResult = await buildFromScratch(
            syllabus.tableOfContents,
            syllabus.title,
            modifiers
        );
        entries = scratchResult.entries;
    }

    // ─────────────────────────────────────────────────────────
    // Step 4: Build final result
    // ─────────────────────────────────────────────────────────
    const videoIds = entries.map(e => e.videoId);
    const totalDurationMinutes = Math.round(
        entries.reduce((sum: number, e: PlaylistEntry) => sum + e.durationSeconds, 0) / 60
    );

    const result: PlaylistResult = {
        syllabusTitle: syllabus.title,
        totalVideos: entries.length,
        totalDurationMinutes,
        entries,
        watchUrl: toWatchURL(videoIds),
        anchor: anchorInfo,
        preferences: prefs,
        generatedAt: new Date().toISOString(),
    };

    console.log("\n" + generateSummary(result));

    return result;
}

// ═══════════════════════════════════════════════════════════════
// ONE-SHOT MODE (Exam Prep)
// ═══════════════════════════════════════════════════════════════

async function handleOneShotMode(
    syllabus: SyllabusData,
    prefs: UserPreferences,
    modifiers: ReturnType<typeof resolvePreferences>
): Promise<PlaylistResult> {
    console.log("🎯 ONE-SHOT MODE: Searching for comprehensive marathon videos...\n");

    const entries = await searchOneShot(syllabus, modifiers);

    const videoIds = entries.map(e => e.videoId);
    const totalDurationMinutes = Math.round(
        entries.reduce((sum: number, e: PlaylistEntry) => sum + e.durationSeconds, 0) / 60
    );

    const result: PlaylistResult = {
        syllabusTitle: syllabus.title,
        totalVideos: entries.length,
        totalDurationMinutes,
        entries,
        watchUrl: toWatchURL(videoIds),
        preferences: prefs,
        generatedAt: new Date().toISOString(),
    };

    console.log("\n" + generateSummary(result));

    return result;
}
