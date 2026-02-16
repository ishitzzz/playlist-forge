import { NextRequest, NextResponse } from "next/server";
import { generateCurriculum, SyllabusModule } from "@/lib/gemini";
import { searchVideoForModule, VideoResult } from "@/lib/video-search";

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
        const playlistPromises = modules.map(async (mod, index) => {
            const video = await searchVideoForModule(mod.query, mod.duration, mod.type, level);
            return {
                ...mod,
                video,
                position: index + 1 // Add 1-based index
            };
        });

        const playlist = await Promise.all(playlistPromises);

        return NextResponse.json({ playlist });

    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
