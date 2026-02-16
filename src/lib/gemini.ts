import { GoogleGenerativeAI } from "@google/generative-ai";

// Load keys from environment
const KEYS = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
].filter((k): k is string => !!k && k !== "YOUR_SECONDARY_GEMINI_KEY");

if (KEYS.length === 0) {
    throw new Error("No valid GEMINI_API_KEY found in environment variables");
}

// Models to try in order
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

export interface SyllabusModule {
    title: string;
    query: string;
    duration: "short" | "medium" | "long";
    type: "concept" | "tutorial" | "lecture";
}

// Helper: Round-robin key selection (simple counter)
let keyIndex = 0;
function getNextKey(): string {
    const key = KEYS[keyIndex];
    keyIndex = (keyIndex + 1) % KEYS.length;
    return key;
}

/**
 * Attempts to generate content with failover strategy:
 * 1. Pick a key (round-robin).
 * 2. Try Primary Model (gemini-2.5-flash).
 * 3. If fail, try Secondary Model (gemini-2.5-flash-lite) with SAME key.
 * 4. If both fail, rotate to NEXT key and repeat.
 */
async function generateContentWithFailover(prompt: string, inlineData: any): Promise<string> {
    let attempts = 0;
    // We'll try (NumKeys * NumModels) times max before giving up
    const maxAttempts = KEYS.length * MODELS.length * 2; // Extra buffer

    // We start with a specific key
    let currentKey = getNextKey();

    for (let kidx = 0; kidx < KEYS.length; kidx++) {
        const genAI = new GoogleGenerativeAI(currentKey);

        for (const modelName of MODELS) {
            try {
                console.log(`[Gemini] Attempting with key ...${currentKey.slice(-4)} and model ${modelName}`);
                const model = genAI.getGenerativeModel({ model: modelName });

                const result = await model.generateContent([
                    prompt,
                    { inlineData },
                ]);

                const response = await result.response;
                return response.text();
            } catch (error: any) {
                console.warn(`[Gemini] Failed with ${modelName} using key ...${currentKey.slice(-4)}:`, error.message);
                // Continue to next model with same key
            }
        }

        // If both models failed for this key, rotate to next key
        currentKey = getNextKey();
    }

    throw new Error("All Gemini failover attempts exhausted.");
}

export async function generateCurriculum(
    fileBase64: string,
    mimeType: string,
    level: string,
    language: string,
    mode: string
): Promise<SyllabusModule[]> {
    const prompt = `
    You are an expert curriculum designer.
    Analyze the uploaded syllabus/screenshot.
    Extract the key topics and structure them into a YouTube playlist curriculum.

    **User Persona:**
    - Level: ${level} (Adjust complexity accordingly. High School = simple/intro, Undergrad = academic/rigorous, Post-Grad = advanced/research-heavy)
    - Language: ${language} (Ensure search queries favor this language if possible, but keep technical terms in English usually).
    - Learning Mode: ${mode}
      - "scratch": Detailed, step-by-step foundation.
      - "revision": High-yield summaries, crash courses.
      - "oneshot": Long-form, comprehensive lectures.

    **Output Format:**
    Return a strictly valid JSON array of objects. No markdown, no backticks.
    [
      {
        "title": "Module Title",
        "query": "Specific YouTube Search Query",
        "duration": "short" | "medium" | "long",
        "type": "concept" | "tutorial" | "lecture"
      }
    ]

    **Rules:**
    - Break down big topics into digestible modules.
    - If "Post-Grad", use terms like "Advanced", "Deep Dive", "Analysis".
    - If "High School", use terms like "Introduction", "Basics", "Explained Simply".
    - For "query", create the PERFECT search string to find the best video. Include the specific topic + context.
  `;

    // Use the failover function
    const text = await generateContentWithFailover(prompt, {
        data: fileBase64,
        mimeType: mimeType,
    });

    try {
        // Clean potential markdown code blocks
        const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleanedText);
    } catch (e) {
        console.error("Failed to parse Gemini response:", text);
        throw new Error("Failed to generate curriculum JSON");
    }
}
