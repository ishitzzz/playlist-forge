import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import clsx from "clsx";

const instrumentSerif = Instrument_Serif({
    weight: "400",
    subsets: ["latin"],
    variable: "--font-instrument-serif",
    display: "swap",
});

export const metadata: Metadata = {
    title: "Playlist Forge",
    description: "Your syllabus, translated into time.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <head>
                <script defer src="https://cloud.umami.is/script.js" data-website-id="4f0c5b35-969e-4806-8df5-5f3aa4892c00"></script>
            </head>
            <body
                className={clsx(
                    instrumentSerif.variable,
                    GeistMono.variable, // Using GeistMono from 'geist/font/mono'
                    "antialiased bg-background text-foreground font-mono"
                )}
            >
                {children}
            </body>
        </html>
    );
}
