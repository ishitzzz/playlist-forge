/**
 * 📸 Syllabus Extractor
 * 
 * Takes a syllabus screenshot/PDF and extracts a structured TOC
 * using Gemini's multimodal capabilities.
 * 
 * KEY MODIFICATION from Dojo:
 * - Adds a flat `tableOfContents: string[]` to the output
 * - For "From Scratch" mode, identifies the Fundamental Concept → index 0
 * 
 * API CALLS: 1 Gemini call per extraction.
 */

import { generateContentWithFailover } from "../core/gemini.js";
import { safeParseJsonObject } from "../core/safeJsonParser.js";
import type { SyllabusData, LearningMode } from "../core/types.js";

// ═══════════════════════════════════════════════════════════════
// PROMPTS
// ═══════════════════════════════════════════════════════════════

function buildExtractionPrompt(learningMode: LearningMode): string {
    const modeInstructions = learningMode === "from_scratch"
        ? `
  FIRST PRINCIPLES ORDERING (CRITICAL):
  - Identify the single most FUNDAMENTAL concept that everything else builds on.
  - Place it as the FIRST item in tableOfContents.
  - Set "fundamentalConcept" to this topic name.
  - Order all other topics so each one builds on the previous.
  - This is the "Evolutionary Chain" — Primitive → Atomic Truth → Abstraction.`
        : learningMode === "revision"
            ? `
  REVISION ORDERING:
  - Order topics from most important/likely-to-be-tested to least.
  - Group related topics together for efficient revision.
  - Skip overly basic topics that a student would already know.`
            : `
  ONE-SHOT ORDERING:
  - Create a SINGLE, comprehensive topic that covers the entire syllabus.
  - The tableOfContents should have AT MOST 3-5 broad items.
  - Each item should represent a major section, not individual topics.`;

    return `You are an expert Curriculum Analyzer for a smart playlist generator.

TASK: Extract the structured learning path from this syllabus image/PDF.

INSTRUCTIONS:
1. Identify the main modules/chapters.
2. Extract 3-5 key topics per module.
3. Ignore administrative details (grading policy, office hours, exam dates).
4. Create a FLAT tableOfContents array — every learnable topic, in correct pedagogical order.
${modeInstructions}

RETURN JSON ONLY:
{
  "title": "Course Title",
  "description": "Brief 1-line summary of the course",
  "fundamentalConcept": "The most basic concept everything builds on (or null if not applicable)",
  "tableOfContents": [
    "Topic 1 (most fundamental first if from_scratch mode)",
    "Topic 2",
    "Topic 3",
    "..."
  ],
  "modules": [
    {
      "moduleTitle": "Module 1: ...",
      "topics": ["Topic A", "Topic B", "Topic C"]
    }
  ]
}

RULES:
- tableOfContents must be a FLAT array of strings (no nesting)
- Each entry should be specific enough to search YouTube for
- Include the course context in each topic (e.g., "Newton's Laws of Motion" not just "Laws")
- Order matters: the sequence defines the playlist order`;
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

export interface ExtractionResult {
    success: boolean;
    data?: SyllabusData;
    error?: string;
    modelUsed?: string;
}

/**
 * Extract a structured table of contents from a syllabus image.
 * 
 * @param imageBuffer - The raw image/PDF bytes
 * @param mimeType - MIME type of the file (e.g., "image/png", "application/pdf")
 * @param learningMode - Controls ordering strategy (from_scratch, revision, one_shot)
 */
export async function extractSyllabus(
    imageBuffer: Buffer,
    mimeType: string,
    learningMode: LearningMode = "from_scratch"
): Promise<ExtractionResult> {
    try {
        const prompt = buildExtractionPrompt(learningMode);

        // Convert image to base64 for Gemini multimodal
        const base64Data = imageBuffer.toString("base64");

        const result = await generateContentWithFailover(
            [
                prompt,
                {
                    inlineData: {
                        mimeType,
                        data: base64Data,
                    },
                },
            ],
            {
                temperature: 0.2,       // Low temp for consistent extraction
                maxOutputTokens: 4096,   // Syllabus can be long
                responseMimeType: "application/json",
            }
        );

        const parsed = safeParseJsonObject<SyllabusData>(result.text);

        if (!parsed || !parsed.tableOfContents || parsed.tableOfContents.length === 0) {
            return {
                success: false,
                error: "Failed to extract table of contents from syllabus. The parsed response was empty or malformed.",
            };
        }

        // Validate structure
        if (!Array.isArray(parsed.tableOfContents)) {
            return {
                success: false,
                error: "tableOfContents must be a flat array of strings",
            };
        }

        console.log(`📚 Extracted ${parsed.tableOfContents.length} topics from "${parsed.title}"`);
        if (parsed.fundamentalConcept) {
            console.log(`🧱 Fundamental concept: "${parsed.fundamentalConcept}"`);
        }

        return {
            success: true,
            data: parsed,
            modelUsed: result.modelUsed,
        };

    } catch (error) {
        console.error("❌ Syllabus extraction failed:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * Extract syllabus from raw text (for testing without images).
 */
export async function extractSyllabusFromText(
    syllabusText: string,
    learningMode: LearningMode = "from_scratch"
): Promise<ExtractionResult> {
    try {
        const prompt = buildExtractionPrompt(learningMode) +
            `\n\nSYLLABUS TEXT:\n${syllabusText}`;

        const result = await generateContentWithFailover(prompt, {
            temperature: 0.2,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
        });

        const parsed = safeParseJsonObject<SyllabusData>(result.text);

        if (!parsed || !parsed.tableOfContents || parsed.tableOfContents.length === 0) {
            return {
                success: false,
                error: "Failed to extract table of contents from text syllabus.",
            };
        }

        return {
            success: true,
            data: parsed,
            modelUsed: result.modelUsed,
        };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
