"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Hero } from "@/components/Hero";
import { Onboarding } from "@/components/Onboarding";
import { UploadZone } from "@/components/UploadZone";
import { LoadingState } from "@/components/LoadingState";
import { PlaylistView } from "@/components/PlaylistView";

type Phase = "hero" | "onboarding" | "upload" | "loading" | "playlist";

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
            const formData = new FormData();
            formData.append("file", file);
            formData.append("mode", mode);
            formData.append("level", persona?.level || "Undergrad");
            formData.append("language", persona?.language || "English");

            const response = await fetch("/api/generate", {
                method: "POST",
                body: formData,
            });

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
            alert("Failed to generate playlist. Please check your API key and try again.");
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
