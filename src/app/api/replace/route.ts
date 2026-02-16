import { NextRequest, NextResponse } from "next/server";
import { searchVideoReplacement } from "@/lib/video-search";

export async function POST(req: NextRequest) {
    try {
        const { videoId, query, duration, level } = await req.json();

        if (!query || !videoId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        console.log(`Replacing video ${videoId} for query "${query}" (Level: ${level})...`);

        const newVideo = await searchVideoReplacement(
            query,
            duration || "medium",
            level || "Undergrad",
            videoId
        );

        if (!newVideo) {
            return NextResponse.json({ error: "No alternative video found" }, { status: 404 });
        }

        return NextResponse.json({ video: newVideo });

    } catch (error) {
        console.error("Replace API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
