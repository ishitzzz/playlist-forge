"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Hero } from "@/components/Hero";
import { Onboarding } from "@/components/Onboarding";
import { UploadZone } from "@/components/UploadZone";
import { LoadingState } from "@/components/LoadingState";
import { PlaylistView } from "@/components/PlaylistView";

type Phase = "hero" | "onboarding" | "upload" | "loading" | "playlist";

// Vercel rejects request bodies over 4.5 MB (413), and a normal phone photo is
// bigger than that, so compress in the browser before upload (per Vercel's own
// FUNCTION_PAYLOAD_TOO_LARGE guidance). Sizing follows the Gemini docs: images
// are tiled into 768x768 tiles at 258 tokens each, and higher resolution helps
// read fine text - so 2048px on the long side keeps a full syllabus page legible
// (about 4-8 tiles, i.e. ~1-2k tokens) while JPEG stays far under both limits
// (Vercel 4.5MB, Gemini inline 20MB). Falls back to the original file if
// decoding fails, so behavior is never worse than before.
async function compressImage(file: File): Promise<File> {
    if (!file.type.startsWith("image/")) return file;
    try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        const MAX_DIM = 2048;
        const MAX_BYTES = 2 * 1024 * 1024;
        const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return file;
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();

        for (const quality of [0.85, 0.7, 0.55, 0.4]) {
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/jpeg", quality)
            );
            if (blob && blob.size <= MAX_BYTES) {
                const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
                return new File([blob], name, { type: "image/jpeg" });
            }
        }
        return file; // still too large even at lowest quality; let the server say so
    } catch {
        return file;
    }
}

export default function Home() {
    const [phase, setPhase] = useState<Phase>("hero");
    const [persona, setPersona] = useState<{ level: string; language: string } | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [playlist, setPlaylist] = useState<any[]>([]);

    const handleStart = () => setPhase("onboarding");

    const handleOnboardingComplete = (data: { level: string; language: string }) => {
        setPersona(data);
        setPhase("upload");
    };

    const handleFileSelect = async (file: File, mode: string) => {
        console.log("File selected:", file.name, "Mode:", mode);
        setFile(file);
        setPhase("loading");

        try {
            const uploadFile = await compressImage(file);
            const formData = new FormData();
            formData.append("file", uploadFile);
            formData.append("mode", mode);
            formData.append("level", persona?.level || "Undergrad");
            formData.append("language", persona?.language || "English");

            const response = await fetch("/api/generate", {
                method: "POST",
                body: formData,
            });

            if (response.status === 413) {
                throw new Error("IMAGE_TOO_LARGE");
            }
            if (!response.ok) {
                throw new Error("Generation failed");
            }

            const data = await response.json();

            // Transform API data to match PlaylistEntry format
            const formattedPlaylist = data.playlist.map((item: any, index: number) => ({
                position: index + 1,
                title: item.title,
                duration: item.video?.timestamp || "Unknown",
                channelName: item.video?.channel || "Unknown Source",
                videoId: item.video?.videoId || "",
                thumbnail: item.video?.thumbnail || "",
                query: item.query, // Pass query for replacement
                level: persona?.level // Pass level for replacement
            }));

            setPlaylist(formattedPlaylist);
            setPhase("playlist");

        } catch (error) {
            console.error("Upload error:", error);
            if (error instanceof Error && error.message === "IMAGE_TOO_LARGE") {
                alert("That image is too large even after compression. Try a screenshot of the syllabus instead of a full photo.");
            } else {
                alert("Failed to generate the playlist. Please try again in a moment.");
            }
            setPhase("upload"); // Go back to upload state
        }
    };

    return (
        <main className="min-h-screen bg-background selection:bg-foreground selection:text-background flex flex-col items-center justify-center relative overflow-hidden">
            <AnimatePresence mode="wait">

                {phase === "hero" && (
                    <motion.div
                        key="hero"
                        exit={{ opacity: 0, y: -20 }}
                        className="w-full"
                    >
                        <Hero onStart={handleStart} />
                    </motion.div>
                )}

                {phase === "onboarding" && (
                    <motion.div
                        key="onboarding"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="w-full"
                    >
                        <Onboarding onComplete={handleOnboardingComplete} />
                    </motion.div>
                )}

                {phase === "upload" && (
                    <motion.div
                        key="upload"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="w-full px-4 space-y-8 text-center"
                    >
                        <div className="relative">
                            <button
                                onClick={() => setPhase("hero")}
                                className="absolute left-0 top-1/2 -translate-y-1/2 font-mono text-xs opacity-40 hover:opacity-100 transition-opacity uppercase tracking-widest"
                            >
                                ← Back
                            </button>
                            <div className="space-y-2">
                                <h2 className="font-serif text-4xl">Upload Syllabus</h2>
                                <p className="font-mono text-sm opacity-50">
                                    {persona?.level} • {persona?.language}
                                </p>
                            </div>
                        </div>
                        <UploadZone onFileSelected={handleFileSelect} />
                    </motion.div>
                )}

                {phase === "loading" && (
                    <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="w-full"
                    >
                        <LoadingState />
                    </motion.div>
                )}

                {phase === "playlist" && (
                    <motion.div
                        key="playlist"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="w-full px-4"
                    >
                        <PlaylistView
                            entries={playlist}
                            playlistUrl="https://youtube.com/playlist?list=..."
                            onBack={() => setPhase("upload")}
                        />
                    </motion.div>
                )}

            </AnimatePresence>
        </main>
    );
}
