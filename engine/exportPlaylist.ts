/**
 * 📤 Export Playlist — "The Smart Hack"
 * 
 * Generates shareable YouTube playlist links and export formats.
 * Zero API quota cost.
 * 
 * THE TRICK:
 * YouTube's undocumented `watch_videos` endpoint creates a temporary playlist
 * from a comma-separated list of video IDs. Users can then click "Save" to
 * make it permanent in their YouTube account.
 * 
 * URL FORMAT: https://www.youtube.com/watch_videos?video_ids=ID1,ID2,ID3,...
 */

import type { PlaylistResult, PlaylistEntry } from "../core/types.js";

// ═══════════════════════════════════════════════════════════════
// URL EXPORT (Zero cost, instant)
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a YouTube watch_videos URL from video IDs.
 * Users click this → temporary playlist opens → they click "Save".
 * 
 * NOTE: YouTube limits this to ~50 video IDs. For longer playlists,
 * chunk into multiple URLs.
 */
export function toWatchURL(videoIds: string[]): string {
    if (videoIds.length === 0) return "";

    // YouTube caps at ~50 videos per watch_videos URL
    const ids = videoIds.slice(0, 50);
    return `https://www.youtube.com/watch_videos?video_ids=${ids.join(",")}`;
}

/**
 * Generate multiple URLs if the playlist is longer than 50 videos.
 */
export function toWatchURLs(videoIds: string[], chunkSize: number = 50): string[] {
    const urls: string[] = [];
    for (let i = 0; i < videoIds.length; i += chunkSize) {
        const chunk = videoIds.slice(i, i + chunkSize);
        urls.push(toWatchURL(chunk));
    }
    return urls;
}

// ═══════════════════════════════════════════════════════════════
// JSON EXPORT
// ═══════════════════════════════════════════════════════════════

/**
 * Export the full playlist as a JSON string.
 * Includes metadata, video details, and the watch URL.
 */
export function toJSON(result: PlaylistResult): string {
    return JSON.stringify(result, null, 2);
}

/**
 * Export a minimal JSON (just the essentials for sharing).
 */
export function toMinimalJSON(result: PlaylistResult): string {
    const minimal = {
        title: result.syllabusTitle,
        totalVideos: result.totalVideos,
        watchUrl: result.watchUrl,
        videos: result.entries.map(e => ({
            position: e.position + 1,  // 1-indexed for humans
            title: e.title,
            url: `https://www.youtube.com/watch?v=${e.videoId}`,
            duration: e.durationDisplay,
            topic: e.topicMatched,
        })),
    };
    return JSON.stringify(minimal, null, 2);
}

// ═══════════════════════════════════════════════════════════════
// CSV EXPORT
// ═══════════════════════════════════════════════════════════════

/**
 * Export the playlist as a CSV string.
 * Columns: Position, Title, Video URL, Duration, Channel, Topic, Source
 */
export function toCSV(result: PlaylistResult): string {
    const header = "Position,Title,Video URL,Duration,Channel,Topic,Source";
    const rows = result.entries.map(e => {
        const url = `https://www.youtube.com/watch?v=${e.videoId}`;
        // Escape commas and quotes in fields
        const safeTitle = `"${e.title.replace(/"/g, '""')}"`;
        const safeTopic = `"${e.topicMatched.replace(/"/g, '""')}"`;
        const safeChannel = `"${e.channelName.replace(/"/g, '""')}"`;

        return [
            e.position + 1,    // 1-indexed
            safeTitle,
            url,
            e.durationDisplay,
            safeChannel,
            safeTopic,
            e.source,
        ].join(",");
    });

    return [header, ...rows].join("\n");
}

// ═══════════════════════════════════════════════════════════════
// MARKDOWN EXPORT (for docs/README)
// ═══════════════════════════════════════════════════════════════

/**
 * Export the playlist as a Markdown table.
 * Useful for embedding in docs or README files.
 */
export function toMarkdown(result: PlaylistResult): string {
    const lines: string[] = [];

    lines.push(`# 📚 ${result.syllabusTitle}`);
    lines.push("");
    lines.push(`**${result.totalVideos} videos** • **${result.totalDurationMinutes} min total**`);
    lines.push("");

    if (result.anchor) {
        lines.push(`> 🎯 Anchor: "${result.anchor.playlistTitle}" by ${result.anchor.channelName} (${result.anchor.coverageScore}% coverage)`);
        lines.push("");
    }

    lines.push(`🔗 **[Open Playlist](${result.watchUrl})**`);
    lines.push("");
    lines.push("| # | Title | Duration | Topic | Source |");
    lines.push("|---|-------|----------|-------|--------|");

    for (const entry of result.entries) {
        const link = `[${entry.title}](https://www.youtube.com/watch?v=${entry.videoId})`;
        lines.push(
            `| ${entry.position + 1} | ${link} | ${entry.durationDisplay} | ${entry.topicMatched} | ${entry.source} |`
        );
    }

    lines.push("");
    lines.push(`*Generated at ${result.generatedAt}*`);

    return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════
// SUMMARY STATS
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a human-readable summary of the playlist.
 */
export function generateSummary(result: PlaylistResult): string {
    const lines: string[] = [];

    lines.push(`📚 Playlist: ${result.syllabusTitle}`);
    lines.push(`📺 ${result.totalVideos} videos (${result.totalDurationMinutes} min total)`);
    lines.push(`⚙️ Mode: ${result.preferences.learningMode}`);
    lines.push(`🌐 Language: ${result.preferences.language}`);

    if (result.anchor) {
        lines.push(
            `🎯 Anchor: "${result.anchor.playlistTitle}" ` +
            `(${result.anchor.coverageScore}% coverage)`
        );
    }

    // Source breakdown
    const sources = result.entries.reduce((acc, e) => {
        acc[e.source] = (acc[e.source] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    lines.push(`📊 Sources: ${Object.entries(sources).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
    lines.push(`🔗 ${result.watchUrl}`);

    return lines.join("\n");
}
