/**
 * 📺 YouTube Data API Client — "The Microscope"
 * 
 * Copied from Dojo: src/utils/youtubeClient.ts
 * No modifications needed — this file has no internal imports.
 * 
 * Provides deep metadata that scrapers miss.
 * Used to enrich video candidates with tags, official categories, and exact statistics.
 * 
 * COST: 1 Unit per 50 videos (extremely cheap).
 */

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3/videos";

export interface YouTubeEnhancement {
    videoId: string;
    channelId: string;
    tags: string[];
    categoryId: string;
    categoryName?: string;
    officialTopics: string[];
    exactDuration: string;
    statistics: {
        viewCount: number;
        likeCount: number;
        commentCount: number;
    };
}

// Map of common YouTube Category IDs to names
const CATEGORY_MAP: Record<string, string> = {
    "1": "Film & Animation",
    "2": "Autos & Vehicles",
    "10": "Music",
    "15": "Pets & Animals",
    "17": "Sports",
    "18": "Short Movies",
    "19": "Travel & Events",
    "20": "Gaming",
    "21": "Videoblogging",
    "22": "People & Blogs",
    "23": "Comedy",
    "24": "Entertainment",
    "25": "News & Politics",
    "26": "Howto & Style",
    "27": "Education",
    "28": "Science & Technology",
    "29": "Nonprofits & Activism",
    "30": "Movies",
    "31": "Anime/Animation",
    "32": "Action/Adventure",
    "33": "Classics",
    "34": "Comedy",
    "35": "Documentary",
    "36": "Drama",
    "37": "Family",
    "38": "Foreign",
    "39": "Horror",
    "40": "Sci-Fi/Fantasy",
    "41": "Thriller",
    "42": "Shorts",
    "43": "Shows",
    "44": "Trailers",
};

/**
 * Fetch detailed metadata for a list of video IDs.
 * Fails safely (returns empty map) if API key is missing or quota exceeded.
 */
export async function fetchVideoDetails(videoIds: string[]): Promise<Map<string, YouTubeEnhancement>> {
    const apiKey = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey || videoIds.length === 0) {
        if (!apiKey) console.warn("⚠️ No YouTube API Key found. Skipping enrichment.");
        return new Map();
    }

    // Deduplicate IDs
    const uniqueIds = Array.from(new Set(videoIds));
    const results = new Map<string, YouTubeEnhancement>();

    // Batch requests in chunks of 50 (API limit)
    const chunks = chunkArray(uniqueIds, 50);

    for (const chunk of chunks) {
        try {
            const params = new URLSearchParams({
                key: apiKey,
                part: "snippet,contentDetails,statistics,topicDetails",
                id: chunk.join(","),
            });

            const res = await fetch(`${YOUTUBE_API_BASE}?${params.toString()}`);

            if (!res.ok) {
                const errorData: any = await res.json();
                console.warn(`⚠️ YouTube API Error (${res.status}):`, errorData.error?.message);
                continue;
            }

            const data: any = await res.json();

            if (data.items) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data.items.forEach((item: any) => {
                    const enhancement: YouTubeEnhancement = {
                        videoId: item.id,
                        channelId: item.snippet.channelId,
                        tags: item.snippet.tags || [],
                        categoryId: item.snippet.categoryId,
                        categoryName: CATEGORY_MAP[item.snippet.categoryId] || "Unknown",
                        officialTopics: extractTopicNames(item.topicDetails?.topicCategories),
                        exactDuration: item.contentDetails.duration,
                        statistics: {
                            viewCount: parseInt(item.statistics.viewCount || "0", 10),
                            likeCount: parseInt(item.statistics.likeCount || "0", 10),
                            commentCount: parseInt(item.statistics.commentCount || "0", 10),
                        }
                    };
                    results.set(item.id, enhancement);
                });
            }

        } catch (error) {
            console.error("❌ YouTube API Network Error:", error);
        }
    }

    if (results.size > 0) {
        console.log(`✨ Enriched ${results.size} videos via YouTube API.`);
    }

    return results;
}

/**
 * Helper: Parse Wikipedia URLs from topicCategories into readable names.
 * e.g. "https://en.wikipedia.org/wiki/Computer_science" -> "Computer science"
 */
function extractTopicNames(urls: string[] | undefined): string[] {
    if (!urls) return [];
    return urls.map(url => {
        const parts = url.split("/");
        const lastPart = parts[parts.length - 1];
        return lastPart.replace(/_/g, " ");
    });
}

function chunkArray<T>(array: T[], size: number): T[][] {
    const chunked: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
}
