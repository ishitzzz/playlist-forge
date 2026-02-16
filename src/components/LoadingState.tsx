"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

const LOADING_MESSAGES = [
    "Consulting the syllabus gods...",
    "Filtering out the clickbait...",
    "Stitching the knowledge gaps...",
    "Translating academic jargon into human English...",
    "Finding the 1% of videos that actually make sense...",
    "Optimizing for your attention span...",
];

export const LoadingState = () => {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
        }, 2000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-8">
            <div className="h-20 flex items-center justify-center overflow-hidden text-center max-w-lg mx-auto px-4">
                <AnimatePresence mode="wait">
                    <motion.p
                        key={index}
                        initial={{ opacity: 0, y: 10, filter: "blur(10px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: -10, filter: "blur(10px)" }}
                        transition={{ duration: 0.5 }}
                        className="font-mono text-sm md:text-base tracking-[0.15em] uppercase text-foreground/70"
                    >
                        {LOADING_MESSAGES[index]}
                    </motion.p>
                </AnimatePresence>
            </div>
        </div>
    );
};
