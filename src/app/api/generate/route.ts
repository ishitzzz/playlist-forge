import { NextRequest, NextResponse } from "next/server";
import { generateCurriculum, SyllabusModule } from "@/lib/gemini";
import { searchVideoForModule, searchCandidates, VideoResult } from "@/lib/video-search";

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const mode = formData.get("mode") as string;
        const level = formData.get("level") as string;
        const language = formData.get("language") as string;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        // Convert file to Base64
        const buffer = Buffer.from(await file.arrayBuffer());
        const base64 = buffer.toString("base64");
        const mimeType = file.type || "image/png";

        // 1. Generate Curriculum (Topics)
        console.log("Generating curriculum with Gemini...");
        const modules = await generateCurriculum(base64, mimeType, level, language, mode);
        console.log(`Generated ${modules.length} modules.`);

        // 2. Search Videos for each module (Parallelized)
        // In a production app, we might want to stream this or use a job queue.
        // For now, we'll `Promise.all` but limit concurrency if needed.

        // Let's attach results to modules
        // Search in parallel, then assign videos in order so no video repeats across modules.
        const candidateLists = await Promise.all(
            modules.map((mod) => searchCandidates(mod.query, `${mod.title} ${mod.query}`, mod.duration, level, new Set(), language))
        );
        const used = new Set<string>();
        const playlist = await Promise.all(modules.map(async (mod, index) => {
            let video: VideoResult | null = candidateLists[index].find((c) => !used.has(c.videoId)) || null;
            if (!video) {
                // every candidate was already used: search again excluding used ids
                video = await searchVideoForModule(mod.query, mod.duration, mod.type, level, new Set(used), language, `${mod.title} ${mod.query}`);
            }
            if (video) used.add(video.videoId);
            return { ...mod, video, position: index + 1 };
        }));

        return NextResponse.json({ playlist });

    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
