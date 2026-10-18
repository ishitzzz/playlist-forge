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
const MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];

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
 * 2. Try Primary Model (gemini-3.5-flash).
 * 3. If fail, try Secondary Model (gemini-3.1-flash-lite) with SAME key.
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
                const model = genAI.getGenerativeModel({
                    model: modelName,
                    generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
                });

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

const MIN_MODULES = 6;
const MAX_MODULES = 16;

function normTitle(t: string): string {
    return t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

// Checks the model output before it reaches video search: drops junk, merges duplicates,
// forces valid enums, and makes sure each query names the topic and the subject.
export function cleanModules(raw: any, level: string): SyllabusModule[] {
    const arr: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.modules) ? raw.modules : [];
    const seen = new Set<string>();
    const out: SyllabusModule[] = [];
    for (const m of arr) {
        if (!m || typeof m !== "object") continue;
        const title = String(m.title ?? "").replace(/\s+/g, " ").trim();
        let query = String(m.query ?? "").replace(/\s+/g, " ").trim();
        const subject = String(m.subject ?? "").replace(/\s+/g, " ").trim();
        if (title.length < 3 || title.length > 120) continue;
        // not a real topic: administrative lines, marks, books, etc.
        if (/^(unit|module|chapter)?\s*[0-9ivx]*\s*$/i.test(title)) continue;
        if (/\b(reference books?|text ?books?|marks|credits?|syllabus|examination|prerequisites?|course outcomes?|lab(oratory)? list)\b/i.test(title)) continue;
        const key = normTitle(title);
        if (!key || seen.has(key)) continue;
        // near-duplicate: one title contains the other
        if (Array.from(seen).some((k) => k.includes(key) || key.includes(k))) continue;
        seen.add(key);
        if (query.length < 8) query = title;
        // Search query must carry the topic words and the subject, so it cannot drift to another subject.
        const qn = normTitle(query);
        if (!normTitle(title).split(" ").filter((w) => w.length > 3).some((w) => qn.includes(w))) query = `${title} ${query}`;
        if (subject && !qn.includes(normTitle(subject).split(" ")[0] || "\u0000")) query = `${query} ${subject}`;
        query = query.slice(0, 140);
        const duration = ["short", "medium", "long"].includes(m.duration) ? m.duration : "medium";
        const type = ["concept", "tutorial", "lecture"].includes(m.type) ? m.type : level === "High School" ? "concept" : "lecture";
        out.push({ title, query, duration, type });
        if (out.length >= MAX_MODULES) break;
    }
    return out;
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
        "subject": "Course/subject name from the syllabus, e.g. Operating Systems",
        "query": "Specific YouTube Search Query",
        "duration": "short" | "medium" | "long",
        "type": "concept" | "tutorial" | "lecture"
      }
    ]

    **Rules:**
    - Use ONLY topics actually present in the syllabus. Never invent topics or add generic filler. Ignore marks, credits, reference books, exam rules and lab lists.
    - Granularity: one module per major topic. Group closely related sub-topics into one module instead of splitting each into its own. Aim for about ${MIN_MODULES + 2} to ${MAX_MODULES - 2} modules for a typical 5-unit course; never more than ${MAX_MODULES}. Use the same granularity every time for the same syllabus.
    - Keep modules in the order the syllabus teaches them. Each module title must be unique and specific, no vague titles like "Introduction" alone and no duplicates or near-duplicates.
    - If "Post-Grad", use terms like "Advanced", "Deep Dive", "Analysis".
    - If "High School", use terms like "Introduction", "Basics", "Explained Simply".
    - For "query", write what a student would type on YouTube: the specific topic plus the subject name, 4 to 10 words, no hashtags, no quotes, no channel names. Example: "Banker's algorithm deadlock avoidance operating systems".
  `;

    const text = await generateContentWithFailover(prompt, {
        data: fileBase64,
        mimeType: mimeType,
    });

    let parsed: any;
    try {
        const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
        parsed = JSON.parse(cleanedText);
    } catch (e) {
        console.error("Failed to parse Gemini response:", text);
        throw new Error("Failed to generate curriculum JSON");
    }

    const modules = cleanModules(parsed, level);
    if (modules.length === 0) throw new Error("Gemini returned no usable modules");
    return modules;
}
