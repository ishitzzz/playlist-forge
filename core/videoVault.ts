/**
 * 🗄️ Video Vault
 * Supabase integration for video caching with pgvector.
 * Enables semantic search and prevents redundant API calls.
 * 
 * Copied from Dojo: src/utils/videoVault.ts
 * No modifications needed — this file has no internal imports.
 */

export interface VideoVaultEntry {
    id?: string;
    video_id: string;
    title: string;
    description: string;
    transcript_snippet: string;
    embedding?: number[];
    density_score: number;
    density_flags: string[];
    metadata: {
        duration_seconds: number;
        author: string;
        views: number;
        fetched_at: string;
        query_used: string;
        user_role?: string;
        experience_level?: string;
    };
}

export interface CacheCheckResult {
    found: boolean;
    entry?: VideoVaultEntry;
    similarity?: number;
}

// ═══════════════════════════════════════════════════════════════
// LOCAL CACHE (In-memory fallback when Supabase is not configured)
// ═══════════════════════════════════════════════════════════════

const LOCAL_CACHE = new Map<string, VideoVaultEntry>();
const QUERY_HASH_CACHE = new Map<string, string>(); // query -> videoId

/**
 * Generate a simple hash for cache key
 */
function hashQuery(query: string, role: string, experience: string): string {
    const normalized = `${query.toLowerCase().trim()}|${role}|${experience}`;
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
}

/**
 * Check if a similar query exists in cache
 * Returns cached video if similarity > 0.9
 */
export async function checkVideoVault(
    query: string,
    userRole: string,
    experienceLevel: string
): Promise<CacheCheckResult> {
    const cacheKey = hashQuery(query, userRole, experienceLevel);

    // Check local cache first
    if (QUERY_HASH_CACHE.has(cacheKey)) {
        const videoId = QUERY_HASH_CACHE.get(cacheKey)!;
        const entry = LOCAL_CACHE.get(videoId);
        if (entry) {
            console.log(`✅ Cache hit for query: "${query.slice(0, 30)}..."`);
            return { found: true, entry, similarity: 1.0 };
        }
    }

    // If Supabase is configured, check there
    if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
        try {
            return await checkSupabaseVault(query, userRole, experienceLevel);
        } catch (error) {
            console.warn("⚠️ Supabase check failed, using local cache:", error);
        }
    }

    return { found: false };
}

/**
 * Store a video in the vault
 */
export async function storeInVideoVault(
    entry: VideoVaultEntry,
    query: string,
    userRole: string,
    experienceLevel: string
): Promise<boolean> {
    const cacheKey = hashQuery(query, userRole, experienceLevel);

    // Always store in local cache
    LOCAL_CACHE.set(entry.video_id, entry);
    QUERY_HASH_CACHE.set(cacheKey, entry.video_id);

    console.log(`💾 Cached video: ${entry.video_id} for query hash: ${cacheKey}`);

    // If Supabase is configured, store there too
    if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
        try {
            await storeInSupabase(entry);
            return true;
        } catch (error) {
            console.warn("⚠️ Supabase store failed:", error);
        }
    }

    return true;
}

/**
 * Get cached video by ID
 */
export function getCachedVideo(videoId: string): VideoVaultEntry | null {
    return LOCAL_CACHE.get(videoId) || null;
}

/**
 * Clear local cache (for development/testing)
 */
export function clearLocalCache(): void {
    LOCAL_CACHE.clear();
    QUERY_HASH_CACHE.clear();
}

// ═══════════════════════════════════════════════════════════════
// SUPABASE INTEGRATION (Activated when env vars are present)
// ═══════════════════════════════════════════════════════════════

async function checkSupabaseVault(
    query: string,
    userRole: string,
    _experienceLevel: string
): Promise<CacheCheckResult> {
    const { createClient } = await import("@supabase/supabase-js");

    const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_KEY!
    );

    const normalizedQuery = query.toLowerCase().trim();

    const { data, error } = await supabase
        .from("video_vault")
        .select("*")
        .eq("metadata->>query_used", normalizedQuery)
        .eq("metadata->>user_role", userRole)
        .limit(1);

    if (error) {
        throw error;
    }

    if (data && data.length > 0) {
        return {
            found: true,
            entry: data[0] as VideoVaultEntry,
            similarity: 1.0,
        };
    }

    return { found: false };
}

async function storeInSupabase(entry: VideoVaultEntry): Promise<void> {
    const { createClient } = await import("@supabase/supabase-js");

    const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_KEY!
    );

    const { error } = await supabase.from("video_vault").upsert({
        video_id: entry.video_id,
        title: entry.title,
        description: entry.description,
        transcript_snippet: entry.transcript_snippet,
        density_score: entry.density_score,
        density_flags: entry.density_flags,
        metadata: entry.metadata,
    }, {
        onConflict: "video_id",
    });

    if (error) {
        throw error;
    }
}

// ═══════════════════════════════════════════════════════════════
// EMBEDDING UTILITIES (For future pgvector integration)
// ═══════════════════════════════════════════════════════════════

/**
 * Generate embedding using Gemini (placeholder for pgvector)
 */
export async function generateQueryEmbedding(
    _query: string
): Promise<number[] | null> {
    console.log("ℹ️ Embedding generation not yet implemented");
    return null;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error("Vectors must have the same length");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
