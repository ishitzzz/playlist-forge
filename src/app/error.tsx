"use client";

import { useEffect } from "react";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
            <h2 className="font-serif text-3xl mb-4">Something went wrong!</h2>
            <p className="font-mono text-sm opacity-50 mb-8 max-w-md">
                {error.message || "An unexpected error occurred."}
            </p>
            <button
                onClick={reset}
                className="px-6 py-3 rounded-full bg-foreground text-background font-mono text-xs tracking-widest uppercase hover:bg-white/90 transition-colors"
            >
                Try again
            </button>
        </div>
    );
}
