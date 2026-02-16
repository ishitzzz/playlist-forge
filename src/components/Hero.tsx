"use client";

import { motion } from "framer-motion";

interface HeroProps {
    onStart?: () => void;
}

export const Hero = ({ onStart }: HeroProps) => {
    return (
        <section className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4 relative overflow-hidden py-32">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="max-w-4xl mx-auto space-y-12"
            >
                <h1 className="font-serif text-[clamp(3.5rem,8vw,8rem)] leading-[0.9] tracking-tight text-foreground">
                    Your syllabus, <br />
                    <span className="italic text-foreground mr-[0.1em]">translated</span> into time.
                </h1>

                <p className="font-mono text-sm tracking-[0.05em] opacity-60 max-w-lg mx-auto leading-relaxed">
                    A HUMAN ENGINE THAT TURNS YOUR SCREENSHOTS INTO A CUSTOM YOUTUBE CURRICULUM.
                </p>

                <motion.button
                    onClick={onStart}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="mt-16 px-10 py-5 bg-white/5 backdrop-blur-md border border-white/10 rounded-full font-mono text-sm tracking-widest hover:bg-white/10 transition-colors duration-300 transform-gpu"
                >
                    GET STARTED
                </motion.button>
            </motion.div>
        </section>
    );
};
