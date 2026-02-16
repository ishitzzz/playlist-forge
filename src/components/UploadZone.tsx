"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, File as FileIcon, X } from "lucide-react";
import clsx from "clsx";

interface UploadZoneProps {
    onFileSelected: (file: File, mode: "scratch" | "revision" | "oneshot") => void;
}

export const UploadZone = ({ onFileSelected }: UploadZoneProps) => {
    const [dragActive, setDragActive] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [mode, setMode] = useState<"scratch" | "revision" | "oneshot">("scratch");

    const learningModes = [
        { id: "scratch", label: "From Scratch" },
        { id: "revision", label: "Revision" },
        { id: "oneshot", label: "One-Shot" },
    ] as const;

    const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const selectedFile = e.dataTransfer.files[0];
            setFile(selectedFile);
            onFileSelected(selectedFile, mode);
        }
    }, [onFileSelected, mode]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            onFileSelected(selectedFile, mode);
        }
    }, [onFileSelected, mode]);

    const removeFile = (e: React.MouseEvent) => {
        e.stopPropagation();
        setFile(null);
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-xl mx-auto space-y-8"
        >
            {/* Learning Modes */}
            <div className="flex justify-center gap-4">
                {learningModes.map((m) => (
                    <button
                        key={m.id}
                        onClick={() => setMode(m.id)}
                        className={clsx(
                            "px-6 py-2 rounded-full font-mono text-xs tracking-wider uppercase transition-all duration-300 border",
                            mode === m.id
                                ? "bg-accent/10 border-accent text-accent"
                                : "bg-transparent border-white/10 text-foreground/40 hover:text-foreground/80 hover:border-white/20"
                        )}
                    >
                        {m.label}
                    </button>
                ))}
            </div>

            <div
                className={clsx(
                    "relative group h-64 w-full rounded-3xl border border-dashed transition-all duration-500 ease-out flex flex-col items-center justify-center p-6 text-center cursor-pointer overflow-hidden backdrop-blur-sm",
                    dragActive
                        ? "border-accent bg-accent/5"
                        : "border-white/10 hover:border-accent/30 hover:bg-white/5",
                    file ? "border-solid border-white/20 bg-black/40" : ""
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById("file-upload")?.click()}
            >
                <input
                    id="file-upload"
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleChange}
                />

                <AnimatePresence mode="wait">
                    {file ? (
                        <motion.div
                            key="file-preview"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="flex flex-col items-center gap-4"
                        >
                            <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                <FileIcon className="w-8 h-8 opacity-70" />
                            </div>
                            <div>
                                <p className="font-mono text-sm truncate max-w-[200px] text-foreground">{file.name}</p>
                                <p className="text-xs opacity-40 font-mono mt-1">
                                    {(file.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                            </div>
                            <button
                                onClick={removeFile}
                                className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors"
                            >
                                <X className="w-4 h-4 opacity-60" />
                            </button>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="upload-prompt"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-4"
                        >
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-500 border border-white/5 group-hover:border-accent/20">
                                <UploadCloud className="w-6 h-6 opacity-40 group-hover:opacity-100 group-hover:text-accent transition-all duration-300" />
                            </div>
                            <p className="font-serif text-2xl text-foreground/80 group-hover:text-foreground transition-colors">Drop your syllabus here</p>
                            <p className="font-mono text-xs opacity-30 tracking-[0.2em] uppercase group-hover:opacity-50 transition-opacity">
                                or click to browse
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
};
