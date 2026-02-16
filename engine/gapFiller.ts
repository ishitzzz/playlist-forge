/**
 * 🔧 Gap Filler — "The Bridge"
 * 
 * Takes an anchor playlist + syllabus TOC and identifies missing topics.
 * Surgically fills gaps with individually-searched videos,
 * then re-sequences everything to match the syllabus order.
 * 
 * PIPELINE (per gap):
 *   1. Build preference-enhanced search query
 *   2. yt-search for candidates
 *   3. Density scoring + duration filtering
 *   4. Optional Gemini rerank
 *   5. Insert at correct position
 * 
 * API CALLS: 1 yt-search per gap (free), optional Gemini rerank per gap.
 */

import ytSearch from "yt-search";
import Fuse from "fuse.js";
import type {
    AnchorPlaylist,
    PlaylistEntry,
    AnchorVideo,
    DurationConfig,
} from "../core/types.js";
import { analyzeQuery } from "../core/queryIntelligence.js";
import {
    rankByDensity,
    filterByDuration,
    prepareForLLMRerank,
    type VideoCandidate,
} from "../core/searchScraper.js";
import { vibeCheckRerank } from "../core/geminiReranker.js";
import type { SearchModifiers } from "./preferences.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface GapFillResult {
    entries: PlaylistEntry[];
    gapsFound: number;
    gapsFilled: number;
    gapsFailed: string[];   // Topics we couldn't find videos for
}

interface TopicMapping {
    topic: string;
    position: number;           // Position in TOC (defines playlist order)
    anchorVideo?: AnchorVideo;  // Matched video from anchor, if any
    isGap: boolean;             // True if needs gap-filling
    matchScore?: number;        // Fuse.js match quality (lower = better)
}

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

/** Fuse.js threshold — below this is considered a "match" */
const MATCH_THRESHOLD = 0.4;

/** Use Gemini reranker for gap-fill candidates? (Costs 1 API call per gap) */
const USE_RERANKER = true;

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

/**
 * Fill gaps in an anchor playlist to match the syllabus 100%.
 * 
 * @param anchor - The anchor playlist (from anchorHunter)
 * @param tableOfContents - The syllabus TOC (ordered)
 * @param subject - The main subject name (for search context)
 * @param modifiers - Search modifiers from user preferences
 */
export async function fillGaps(
    anchor: AnchorPlaylist,
    tableOfContents: string[],
    subject: string,
    modifiers: SearchModifiers
): Promise<GapFillResult> {
    // ─────────────────────────────────────────────────────────
    // STEP 1: Map every TOC item to an anchor video (or mark as gap)
    // ─────────────────────────────────────────────────────────
    const mappings = mapTopicsToAnchor(tableOfContents, anchor.videos);
    const gaps = mappings.filter(m => m.isGap);

    console.log(`🔧 Gap Filler: ${gaps.length}/${tableOfContents.length} topics need filling`);

    // ─────────────────────────────────────────────────────────
    // STEP 2: Fill each gap with individually-searched videos
    // ─────────────────────────────────────────────────────────
    const gapsFailed: string[] = [];
    const gapEntries = new Map<number, PlaylistEntry>();

    for (const gap of gaps) {
        console.log(`  🔍 Filling gap: "${gap.topic}" (position ${gap.position})`);

        const entry = await searchForTopic(
            gap.topic,
            subject,
            modifiers,
            gap.position
        );

        if (entry) {
            gapEntries.set(gap.position, entry);
        } else {
            gapsFailed.push(gap.topic);
            console.warn(`  ⚠️ No video found for: "${gap.topic}"`);
        }
    }

    // ─────────────────────────────────────────────────────────
    // STEP 3: Merge anchor videos + gap fills into final sequence
    // ─────────────────────────────────────────────────────────
    const entries = resequence(mappings, anchor, gapEntries);

    return {
        entries,
        gapsFound: gaps.length,
        gapsFilled: gapEntries.size,
        gapsFailed,
    };
}

/**
 * Build a playlist entirely from per-topic search (no anchor).
 * Used when no anchor playlist is found.
 */
export async function buildFromScratch(
    tableOfContents: string[],
    subject: string,
    modifiers: SearchModifiers
): Promise<GapFillResult> {
    console.log(`🔧 Building from scratch: ${tableOfContents.length} topics to search`);

    const entries: PlaylistEntry[] = [];
    const gapsFailed: string[] = [];

    for (let i = 0; i < tableOfContents.length; i++) {
        const topic = tableOfContents[i];
        console.log(`  🔍 [${i + 1}/${tableOfContents.length}] Searching: "${topic}"`);

        const entry = await searchForTopic(topic, subject, modifiers, i);

        if (entry) {
            entries.push(entry);
        } else {
            gapsFailed.push(topic);
        }
    }

    return {
        entries,
        gapsFound: tableOfContents.length,
        gapsFilled: entries.length,
        gapsFailed,
    };
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL: Topic Mapping with Fuse.js
// ═══════════════════════════════════════════════════════════════

function mapTopicsToAnchor(
    tableOfContents: string[],
    anchorVideos: AnchorVideo[]
): TopicMapping[] {
    const fuseItems = anchorVideos.map(v => ({ title: v.title, video: v }));
    const fuse = new Fuse(fuseItems, {
        threshold: MATCH_THRESHOLD,
        distance: 100,
        includeScore: true,
        keys: ["title"],
    });

    return tableOfContents.map((topic, position) => {
        const results = fuse.search(topic);

        if (results.length > 0 && results[0].score !== undefined && results[0].score < MATCH_THRESHOLD) {
            return {
                topic,
                position,
                anchorVideo: results[0].item.video,
                isGap: false,
                matchScore: results[0].score,
            };
        }

        return {
            topic,
            position,
            isGap: true,
        };
    });
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL: Per-Topic Video Search
// ═══════════════════════════════════════════════════════════════

async function searchForTopic(
    topic: string,
    subject: string,
    modifiers: SearchModifiers,
    position: number
): Promise<PlaylistEntry | null> {
    try {
        // Build search query with preferences
        const contextualTopic = `${subject} ${topic}`;
        const { smartQuery } = analyzeQuery(contextualTopic);

        // Append language suffix and mode keywords
        const searchQuery = [
            smartQuery.primary,
            modifiers.languageSuffix,
        ].filter(Boolean).join(" ");

        // yt-search
        const result = await ytSearch(searchQuery);
        const videos = result.videos || [];

        if (videos.length === 0) {
            // Fallback: simpler query
            const fallbackResult = await ytSearch(`${topic} ${modifiers.languageSuffix}`.trim());
            if (!fallbackResult.videos || fallbackResult.videos.length === 0) {
                return null;
            }
            return pickBestVideo(fallbackResult.videos, topic, modifiers, position);
        }

        return pickBestVideo(videos, topic, modifiers, position);

    } catch (error) {
        console.error(`❌ Search failed for "${topic}":`, error);
        return null;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pickBestVideo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawVideos: any[],
    topic: string,
    modifiers: SearchModifiers,
    position: number
): Promise<PlaylistEntry | null> {
    // Convert yt-search results to VideoCandidate format
    const candidates: VideoCandidate[] = rawVideos.slice(0, 15).map(v => ({
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
    }));

    // Filter by duration
    const filtered = filterByDuration(candidates, modifiers.duration.minSeconds)
        .filter(v => v.duration.seconds <= modifiers.duration.maxSeconds);

    // If duration filtering removed everything, relax constraints
    const pool = filtered.length > 0
        ? filtered
        : filterByDuration(candidates, 60); // At least 1 minute

    if (pool.length === 0) return null;

    // Rank by density
    const ranked = rankByDensity(pool);

    // Optional: Gemini rerank
    let winnerId = ranked[0].videoId;

    if (USE_RERANKER && ranked.length >= 3) {
        const llmInput = prepareForLLMRerank(ranked.slice(0, 5));
        const reranked = await vibeCheckRerank({
            candidates: llmInput,
            userRole: "Student",
            topic,
            experienceLevel: modifiers.experienceLevel,
        });

        if (reranked.winnerId) {
            winnerId = reranked.winnerId;
        }
    }

    const winner = ranked.find(v => v.videoId === winnerId) || ranked[0];

    return {
        position,
        videoId: winner.videoId,
        title: winner.title,
        channelName: winner.author.name,
        durationSeconds: winner.duration.seconds,
        durationDisplay: winner.duration.timestamp,
        topicMatched: topic,
        source: "gap_fill",
    };
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL: Re-sequencing
// ═══════════════════════════════════════════════════════════════

function resequence(
    mappings: TopicMapping[],
    anchor: AnchorPlaylist,
    gapEntries: Map<number, PlaylistEntry>
): PlaylistEntry[] {
    const entries: PlaylistEntry[] = [];

    for (const mapping of mappings) {
        if (!mapping.isGap && mapping.anchorVideo) {
            // Use the anchor video
            entries.push({
                position: mapping.position,
                videoId: mapping.anchorVideo.videoId,
                title: mapping.anchorVideo.title,
                channelName: anchor.channelName,
                durationSeconds: mapping.anchorVideo.durationSeconds,
                durationDisplay: mapping.anchorVideo.durationDisplay,
                topicMatched: mapping.topic,
                source: "anchor_playlist",
            });
        } else if (gapEntries.has(mapping.position)) {
            // Use the gap-filled video
            entries.push(gapEntries.get(mapping.position)!);
        }
        // If neither exists, this topic is simply missing (tracked in gapsFailed)
    }

    // Sort by position (should already be, but ensure)
    entries.sort((a, b) => a.position - b.position);

    // Re-number positions to be contiguous
    entries.forEach((e, i) => { e.position = i; });

    return entries;
}
