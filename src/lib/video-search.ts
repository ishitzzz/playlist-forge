import yts from "yt-search";

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

// Fallback search using official YouTube Data API
async function searchYouTubeAPI(query: string): Promise<RawVideoItem[]> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
        console.warn("YOUTUBE_API_KEY not found. Skipping fallback.");
        return [];
    }

    try {
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(query)}&type=video&key=${apiKey}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.error(`YouTube API Error: ${response.status} ${response.statusText}`);
            return [];
        }

        const data = await response.json();
        if (!data.items) return [];

        // Map API response to RawVideoItem format
        return data.items.map((item: any) => ({
            videoId: item.id.videoId,
            title: item.snippet.title,
            seconds: 0, // Duration requires a separate API call, defaulting to 0 for fallback
            timestamp: "Unknown",
            views: 0, // Views require separate API call
            url: `https://youtube.com/watch?v=${item.id.videoId}`,
            image: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
            thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
            author: {
                name: item.snippet.channelTitle
            }
        }));
    } catch (e) {
        console.error("YouTube API Fetch Error:", e);
        return [];
    }
}

export async function searchVideoForModule(
    query: string,
    durationPref: "short" | "medium" | "long",
    typePref: "concept" | "tutorial" | "lecture",
    level: string
): Promise<VideoResult | null> {

    // Augment query based on level to ensure "first principles" or "rigorous" content
    let augmentedQuery = query;
    if (level === "Undergrad" || level === "Post-Grad") {
        augmentedQuery += " lecture OR tutorial -shorts";
    } else {
        augmentedQuery += " explained simply -shorts";
    }

    let videos: RawVideoItem[] = [];

    // 1. Try Scraper (Primary)
    try {
        console.log(`Searching (Primary): ${augmentedQuery}`);
        const r = await yts(augmentedQuery);
        videos = r.videos.slice(0, 10) as unknown as RawVideoItem[];
    } catch (error) {
        console.warn("Primary search failed (likely blocked). Attempting fallback...", error);
        // 2. Try API (Fallback)
        videos = await searchYouTubeAPI(augmentedQuery);
    }

    // Filter and Rank
    const ranked = videos
        .filter((v) => {
            // Basic filtering: filter out shorts (< 60s) if duration is known
            if (v.seconds && v.seconds < 60) return false;
            return true;
        })
        .sort((a, b) => {
            // Heuristic Scoring
            let scoreA = 0;
            let scoreB = 0;

            // 1. Duration Matching (Only if known, API doesn't return without extra call)
            if (a.seconds) scoreA += getDurationScore(a.seconds, durationPref);
            if (b.seconds) scoreB += getDurationScore(b.seconds, durationPref);

            // 2. Clickbait Filter (Simplified)
            if (!isAllCaps(a.title)) scoreA += 5;
            if (!isAllCaps(b.title)) scoreB += 5;

            // 3. Educational Channel Preference (Keyword boost)
            const eduKeywords = ["academy", "university", "institute", "lecture", "course", "professor", "mit", "stanford", "freecodecamp", "crash course"];
            if (a.author && eduKeywords.some(k => a.author.name.toLowerCase().includes(k))) scoreA += 10;
            if (b.author && eduKeywords.some(k => b.author.name.toLowerCase().includes(k))) scoreB += 10;

            return scoreB - scoreA; // Descending sort
        });

    if (ranked.length > 0) {
        const best = ranked[0];
        return {
            videoId: best.videoId,
            title: best.title,
            timestamp: best.timestamp || "Unknown", // Handle unknown duration from API
            channel: best.author?.name || "Unknown Channel",
            views: best.views || 0,
            url: best.url,
            thumbnail: best.thumbnail || best.image || "",
        };
    }

    return null;
}

function getDurationScore(seconds: number, pref: "short" | "medium" | "long"): number {
    const min = seconds / 60;
    if (pref === "short") {
        // 1-10 mins ideal
        return min >= 1 && min <= 10 ? 10 : 0;
    } else if (pref === "medium") {
        // 10-30 mins ideal
        return min > 10 && min <= 30 ? 10 : 0;
    } else {
        // 30+ mins ideal
        return min > 30 ? 10 : 0;
    }
}

export async function searchVideoReplacement(
    query: string,
    durationPref: "short" | "medium" | "long",
    level: string,
    excludeVideoId: string
): Promise<VideoResult | null> {

    // 1. Augment Query
    let augmentedQuery = query;
    if (level === "Undergrad" || level === "Post-Grad") {
        augmentedQuery += " lecture OR tutorial -shorts";
    } else {
        augmentedQuery += " explained simply -shorts";
    }

    let videos: RawVideoItem[] = [];

    // 1. Try Scraper (Primary)
    try {
        const r = await yts(augmentedQuery);
        videos = r.videos.slice(0, 15) as unknown as RawVideoItem[];
    } catch (error) {
        console.warn("Primary replacement search failed. Attempting fallback...");
        videos = await searchYouTubeAPI(augmentedQuery);
    }

    // 2. Filter & Rank (Similar to searchVideoForModule but excludes current ID)
    const ranked = videos
        .filter((v) => {
            if (v.videoId === excludeVideoId) return false; // EXCLUDE CURRENT VIDEO
            if (v.seconds && v.seconds < 60) return false;
            return true;
        })
        .sort((a, b) => {
            // Same scoring logic as before
            let scoreA = 0;
            let scoreB = 0;
            if (a.seconds) scoreA += getDurationScore(a.seconds, durationPref);
            if (b.seconds) scoreB += getDurationScore(b.seconds, durationPref);
            if (!isAllCaps(a.title)) scoreA += 5;
            if (!isAllCaps(b.title)) scoreB += 5;
            const eduKeywords = ["academy", "university", "institute", "lecture", "course", "professor", "mit", "stanford", "freecodecamp", "crash course"];
            if (a.author && eduKeywords.some(k => a.author.name.toLowerCase().includes(k))) scoreA += 10;
            if (b.author && eduKeywords.some(k => b.author.name.toLowerCase().includes(k))) scoreB += 10;
            return scoreB - scoreA;
        });

    if (ranked.length > 0) {
        const best = ranked[0];
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
    return null;
}

function isAllCaps(str: string): boolean {
    return !!str && str === str.toUpperCase() && str.length > 5;
}
