// Prioritize official API to avoid IP blocking/scraping issues on Vercel
// Fallback to yt-search only if all API keys fail.

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

// ---------------------------------------------------------------------------
// 1. API Key Rotation Logic
// ---------------------------------------------------------------------------

function getApiKeys(): string[] {
    const keys = [
        process.env.YOUTUBE_API_KEY,
        process.env.YOUTUBE_API_KEY_2,
        process.env.YOUTUBE_API_KEY_3
    ].filter((k): k is string => !!k && k.length > 0); // Filter out undefined/empty
    return keys;
}

async function searchYouTubeAPIWithRotation(query: string): Promise<RawVideoItem[]> {
    const keys = getApiKeys();

    if (keys.length === 0) {
        console.warn("No YOUTUBE_API_KEYs found in environment variables.");
        return [];
    }

    for (let i = 0; i < keys.length; i++) {
        const apiKey = keys[i];
        const maskedKey = apiKey.substring(0, 4) + "...";
        console.log(`Trying API Key #${i + 1} (${maskedKey}) for query: "${query.substring(0, 20)}..."`);

        try {
            const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(query)}&type=video&key=${apiKey}`;
            const response = await fetch(url);

            if (response.ok) {
                const data = await response.json();
                if (!data.items) {
                    console.warn(`Key #${i + 1} worked but returned no items.`);
                    return [];
                }
                console.log(`Key #${i + 1} success! Found ${data.items.length} videos.`);
                return mapApiToRaw(data.items);
            }

            // Handle Errors
            const errorText = await response.text();
            console.error(`Key #${i + 1} failed: ${response.status} ${response.statusText}`, errorText);

            // If 403 (Quota/Forbidden), continue to next key. 
            // If 400 (Bad Request), it's the query, don't rotate.
            if (response.status === 403) {
                console.warn(`Key #${i + 1} quota exceeded or blocked. Rotating to next key...`);
                continue;
            } else {
                // Non-retryable error (e.g. 400 bad request)
                break;
            }

        } catch (e) {
            console.error(`Key #${i + 1} network error:`, e);
            // Network glitch? Try next key just in case
            continue;
        }
    }

    console.warn("All API keys failed or exhausted.");
    return [];
}

function mapApiToRaw(items: any[]): RawVideoItem[] {
    return items.map((item: any) => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        seconds: 0, // Duration requires separate API call
        timestamp: "Unknown",
        views: 0,
        url: `https://youtube.com/watch?v=${item.id.videoId}`,
        image: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
        author: {
            name: item.snippet.channelTitle
        }
    }));
}

// ---------------------------------------------------------------------------
// 2. Main Search Functions
// ---------------------------------------------------------------------------

export async function searchVideoForModule(
    query: string,
    durationPref: "short" | "medium" | "long",
    typePref: "concept" | "tutorial" | "lecture",
    level: string
): Promise<VideoResult | null> {

    // Augment query
    let augmentedQuery = query;
    if (level === "Undergrad" || level === "Post-Grad") {
        augmentedQuery += " lecture OR tutorial -shorts";
    } else {
        augmentedQuery += " explained simply -shorts";
    }

    let videos: RawVideoItem[] = [];

    // STEP 1: Try Official API (Rotation) -> PRIMARY
    videos = await searchYouTubeAPIWithRotation(augmentedQuery);

    // STEP 2: Scraper Fallback (Only if API completely fails/returns 0)
    if (videos.length === 0) {
        console.warn("API returned 0 videos. Attempting 'yt-search' scraper as last resort...");
        try {
            const { default: yts } = await import("yt-search");
            const r = await yts(augmentedQuery);
            if (r && r.videos) {
                videos = r.videos.slice(0, 10) as unknown as RawVideoItem[];
                console.log(`Scraper saved the day! Found ${videos.length} videos.`);
            }
        } catch (error) {
            console.warn("Scraper also failed. Giving up.", error);
        }
    }

    // Filter and Rank
    const ranked = rankVideos(videos, durationPref);

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

export async function searchVideoReplacement(
    query: string,
    durationPref: "short" | "medium" | "long",
    level: string,
    excludeVideoId: string
): Promise<VideoResult | null> {

    let augmentedQuery = query;
    if (level === "Undergrad" || level === "Post-Grad") {
        augmentedQuery += " lecture OR tutorial -shorts";
    } else {
        augmentedQuery += " explained simply -shorts";
    }

    let videos: RawVideoItem[] = [];

    // STEP 1: Official API
    videos = await searchYouTubeAPIWithRotation(augmentedQuery);

    // STEP 2: Scraper Fallback
    if (videos.length === 0) {
        try {
            const { default: yts } = await import("yt-search");
            const r = await yts(augmentedQuery);
            if (r && r.videos) {
                videos = r.videos.slice(0, 15) as unknown as RawVideoItem[];
            }
        } catch (error) {
            console.warn("Scraper replacement search failed.");
        }
    }

    // Filter & Rank (Excluding current video)
    const ranked = rankVideos(videos, durationPref).filter(v => v.videoId !== excludeVideoId);

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

// ---------------------------------------------------------------------------
// 3. Ranking Helpers
// ---------------------------------------------------------------------------

function rankVideos(videos: RawVideoItem[], durationPref: "short" | "medium" | "long"): RawVideoItem[] {
    return videos
        .filter((v) => {
            if (v.seconds && v.seconds < 60) return false; // Filter shorts if known
            return true;
        })
        .sort((a, b) => {
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
}

function getDurationScore(seconds: number, pref: "short" | "medium" | "long"): number {
    const min = seconds / 60;
    if (pref === "short") return min >= 1 && min <= 10 ? 10 : 0;
    if (pref === "medium") return min > 10 && min <= 30 ? 10 : 0;
    return min > 30 ? 10 : 0;
}

function isAllCaps(str: string): boolean {
    return !!str && str === str.toUpperCase() && str.length > 5;
}
