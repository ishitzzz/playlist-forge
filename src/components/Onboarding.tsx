"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { ChevronRight, ChevronDown } from "lucide-react";

type Level = "High School" | "Undergrad" | "Post-Grad";
type Language = "English" | "Hindi" | "Hinglish";

interface OnboardingProps {
    onComplete: (data: { level: Level; language: Language }) => void;
}

const CustomSelect = ({
    value,
    options,
    onChange,
    className
}: {
    value: string;
    options: string[];
    onChange: (val: string) => void;
    className?: string;
}) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <span className="relative inline-block mx-2 group">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={clsx(
                    "flex items-center gap-1 border-b-2 pb-1 px-2 transition-all duration-300 rounded-md focus:outline-none relative",
                    className,
                    isOpen && "bg-white/10"
                )}
            >
                {value}
                <ChevronDown className={clsx("w-4 h-4 opacity-50 transition-transform duration-300", isOpen && "rotate-180")} />
                {/* Glow effect on hover */}
                <span className="absolute -inset-2 rounded-xl -z-10 bg-current opacity-0 group-hover:opacity-5 transition-opacity duration-300 blur-lg" />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsOpen(false)} />
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            className="absolute left-1/2 -translate-x-1/2 top-full mt-4 w-max min-w-[200px] bg-[#0A0A0A]/90 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden z-50 shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-2 flex flex-col gap-1 ring-1 ring-white/5"
                        >
                            {options.map((opt) => (
                                <button
                                    key={opt}
                                    onClick={() => {
                                        onChange(opt);
                                        setIsOpen(false);
                                    }}
                                    className={clsx(
                                        "w-full px-4 py-3 rounded-xl text-sm font-mono text-left transition-all duration-200",
                                        value === opt
                                            ? "bg-white/10 text-foreground font-medium"
                                            : "text-foreground/60 hover:text-foreground hover:bg-white/5"
                                    )}
                                >
                                    {opt}
                                </button>
                            ))}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </span>
    );
};

export const Onboarding = ({ onComplete }: OnboardingProps) => {
    const [level, setLevel] = useState<Level>("Undergrad");
    const [language, setLanguage] = useState<Language>("English");

    const levels: Level[] = ["High School", "Undergrad", "Post-Grad"];
    const languages: Language[] = ["English", "Hindi", "Hinglish"];

    return (
        <section className="w-full h-full flex flex-col items-center justify-center px-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="text-center space-y-12 max-w-4xl"
            >
                <div className="font-serif text-[clamp(2.5rem,5vw,5rem)] leading-[1.6] text-foreground/90 py-10">
                    I am a
                    <CustomSelect
                        value={level}
                        options={levels}
                        onChange={(val) => setLevel(val as Level)}
                        className="text-accent border-accent/30 hover:border-accent"
                    />
                    student,
                    <br />
                    learning in
                    <CustomSelect
                        value={language}
                        options={languages}
                        onChange={(val) => setLanguage(val as Language)}
                        className="text-accent-blue border-accent-blue/30 hover:border-accent-blue"
                    />
                    .
                </div>

                <motion.button
                    whileHover={{ x: 5 }}
                    onClick={() => onComplete({ level, language })}
                    className="group flex items-center gap-2 mx-auto text-sm font-mono tracking-[0.2em] uppercase text-foreground/60 hover:text-accent transition-colors duration-300"
                >
                    Continue
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform stroke-[1.5]" />
                </motion.button>
            </motion.div>
        </section>
    );
};
