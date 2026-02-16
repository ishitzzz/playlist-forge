"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Play, RefreshCw, ExternalLink } from "lucide-react";
import { useState } from "react";
import clsx from "clsx";

// Mock types for UI development
interface VideoEntry {
    position: number;
    title: string;
    duration: string;
    channelName: string;
    videoId: string;
    query?: string; // Needed for replacement
    level?: string; // Needed for replacement
    thumbnail?: string;
}

interface PlaylistViewProps {
    entries: VideoEntry[];
    playlistUrl: string;
    onBack: () => void;
}

export const PlaylistView = ({ entries, playlistUrl, onBack }: PlaylistViewProps) => {
    const [currentEntries, setCurrentEntries] = useState(entries);
    const [replacingId, setReplacingId] = useState<string | null>(null);

    const handleReplace = async (videoId: string, query?: string, level?: string) => {
        if (!query) return; /* ... same logic ... */
        setReplacingId(videoId);

        try {
            const response = await fetch("/api/replace", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    videoId,
                    query,
                    level: level || "Undergrad",
                    duration: "medium"
                }),
            });

            if (!response.ok) throw new Error("Correction failed");

            const data = await response.json();
            const newVideo = data.video;

            setCurrentEntries((prev) => prev.map((entry) => {
                if (entry.videoId === videoId) {
                    return {
                        ...entry,
                        videoId: newVideo.videoId,
                        title: newVideo.title,
                        duration: newVideo.timestamp,
                        channelName: newVideo.channel,
                        thumbnail: newVideo.thumbnail,
                        query: query,
                        level: level
                    };
                }
                return entry;
            }));

        } catch (err) {
            console.error("Failed to replace video:", err);
            alert("Could not find a better alternative right now.");
        } finally {
            setReplacingId(null);
        }
    };

    const watchUrl = "https://www.youtube.com/watch_videos?video_ids=" + currentEntries.map(e => e.videoId).join(",");

    return (
        <section className="w-[90%] max-w-[1200px] mx-auto space-y-12 pb-32">
            {/* Minimal Header */}
            <div className="flex items-end justify-between border-b border-white/10 pb-6">
                <div>
                    <h2 className="font-serif text-[clamp(2rem,4vw,3rem)] text-foreground leading-[1.1]">
                        Curriculum
                    </h2>
                    <p className="font-mono text-xs tracking-wider opacity-50 mt-2 uppercase flex items-center gap-4">
                        <span>{currentEntries.length} Modules • Generated just now</span>
                        <button
                            onClick={onBack}
                            className="text-accent/60 hover:text-accent underline decoration-accent/30 hover:decoration-accent transition-all pl-4 border-l border-white/10"
                        >
                            Generate New
                        </button>
                    </p>
                </div>
                <a
                    href={watchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-2 px-6 py-3 bg-foreground text-background rounded-full font-mono text-xs tracking-widest hover:bg-white transition-colors uppercase"
                >
                    <Play className="w-3 h-3 fill-current group-hover:scale-110 transition-transform" />
                    Play All
                </a>
            </div>

            {/* Table / Grid */}
            <div className="grid gap-px bg-white/5 rounded-2xl overflow-hidden border border-white/10">
                {currentEntries.map((video, index) => (
                    <motion.div
                        key={`${video.videoId}-${index}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: index * 0.05 }}
                        className={clsx(
                            "relative bg-[#0A0A0A] p-6 hover:bg-white/[0.02] transition-colors group grid md:grid-cols-[auto_1fr_auto] gap-6 items-center",
                            replacingId === video.videoId && "pointer-events-none"
                        )}
                    >
                        {/* Index */}
                        <div className="font-mono text-xs opacity-30 w-8">
                            {String(video.position).padStart(2, "0")}
                        </div>

                        {/* Content */}
                        <div className={clsx("space-y-1 transition-all duration-500", replacingId === video.videoId && "blur-sm opacity-50")}>
                            <h3 className="font-serif text-xl leading-tight text-foreground/90 group-hover:text-accent transition-colors cursor-pointer">
                                {video.title}
                            </h3>
                            <p className="font-mono text-[10px] uppercase tracking-wider opacity-40">
                                {video.channelName} • {video.duration}
                            </p>
                        </div>

                        {/* Replace Message Overlay */}
                        <AnimatePresence>
                            {replacingId === video.videoId && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 flex items-center justify-center"
                                >
                                    <p className="font-mono text-xs text-accent tracking-widest uppercase animate-pulse">
                                        Searching for a better match...
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Actions */}
                        <div className={clsx("flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity md:translate-x-0", replacingId === video.videoId && "opacity-0")}>
                            <button
                                onClick={() => handleReplace(video.videoId, video.query, video.level)}
                                className="p-2 hover:bg-white/5 rounded-full transition-colors group/btn"
                                title="Replace Video"
                            >
                                <RefreshCw className="w-4 h-4 opacity-40 group-hover/btn:opacity-100 group-hover/btn:text-accent transition-all" />
                            </button>
                            <a
                                href={`https://youtube.com/watch?v=${video.videoId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 hover:bg-white/5 rounded-full transition-colors group/link"
                                title="Open in YouTube"
                            >
                                <ExternalLink className="w-4 h-4 opacity-40 group-hover/link:opacity-100 transition-all" />
                            </a>
                        </div>
                    </motion.div>
                ))}
            </div>
        </section>
    );
};
