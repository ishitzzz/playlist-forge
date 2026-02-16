"use client";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html>
            <body className="bg-background text-foreground min-h-screen flex items-center justify-center">
                <div className="text-center p-4">
                    <h2 className="font-serif text-3xl mb-4">Critical System Error</h2>
                    <button
                        onClick={reset}
                        className="px-6 py-3 rounded-full bg-foreground text-background font-mono text-xs tracking-widest uppercase hover:bg-white/90 transition-colors"
                    >
                        Reboot System
                    </button>
                </div>
            </body>
        </html>
    );
}
