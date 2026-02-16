/**
 * 🧪 Smoke Test for Playlist Forge
 * 
 * Tests that all modules import correctly and basic logic works.
 * Does NOT make real API calls — just validates the pipeline structure.
 * 
 * Run: npx tsx test/smoke.ts
 */

import { validatePreferences, resolvePreferences, getDefaultPreferences } from "../engine/preferences.js";
import { toWatchURL, toCSV, toMarkdown, generateSummary } from "../engine/exportPlaylist.js";
import {
    DURATION_CONFIGS,
    LANGUAGE_SUFFIXES,
    STUDENT_EXPERIENCE_MAP,
    type PlaylistResult,
    type PlaylistEntry,
} from "../core/types.js";

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.error(`  ❌ FAILED: ${label}`);
        failed++;
    }
}

console.log("\n🧪 Playlist Forge — Smoke Tests\n");

// ─── Test 1: Preferences ──────────────────────────────
console.log("📋 Test 1: Preferences");

const defaultPrefs = getDefaultPreferences();
assert(defaultPrefs.studentType === "undergrad", "Default student type is undergrad");
assert(defaultPrefs.language === "english", "Default language is english");
assert(defaultPrefs.learningMode === "from_scratch", "Default learning mode is from_scratch");

const validated = validatePreferences({ studentType: "invalid" as any, language: "hindi" });
assert(validated.studentType === "undergrad", "Invalid student type falls back to undergrad");
assert(validated.language === "hindi", "Valid language is preserved");

const modifiers = resolvePreferences(defaultPrefs);
assert(modifiers.experienceLevel === "intermediate", "Undergrad maps to intermediate");
assert(modifiers.languageSuffix === "", "English has no suffix");
assert(modifiers.duration.minSeconds === 600, "From-scratch min duration is 600s (10min)");

const hindiMods = resolvePreferences({ studentType: "high_school", language: "hindi", learningMode: "revision" });
assert(hindiMods.languageSuffix === "in Hindi", "Hindi has 'in Hindi' suffix");
assert(hindiMods.experienceLevel === "beginner", "High school maps to beginner");
assert(hindiMods.duration.maxSeconds === 900, "Revision max duration is 900s (15min)");

// ─── Test 2: Duration Configs ───────────────────────
console.log("\n📋 Test 2: Duration Configs");

assert(DURATION_CONFIGS.from_scratch.minSeconds === 600, "From-scratch min: 600s");
assert(DURATION_CONFIGS.revision.maxSeconds === 900, "Revision max: 900s");
assert(DURATION_CONFIGS.one_shot.minSeconds === 2700, "One-shot min: 2700s (45min)");

// ─── Test 3: Language & Student Mapping ──────────────
console.log("\n📋 Test 3: Constants");

assert(LANGUAGE_SUFFIXES.english === "", "English suffix is empty");
assert(LANGUAGE_SUFFIXES.hindi === "in Hindi", "Hindi suffix is 'in Hindi'");
assert(STUDENT_EXPERIENCE_MAP.post_grad === "advanced", "Post-grad maps to advanced");

// ─── Test 4: Export Functions ─────────────────────────
console.log("\n📋 Test 4: Export Functions");

const mockEntries: PlaylistEntry[] = [
    {
        position: 0,
        videoId: "abc12345678",
        title: "Introduction to Data Structures",
        channelName: "CS Academy",
        durationSeconds: 1200,
        durationDisplay: "20:00",
        topicMatched: "Data Structures Introduction",
        source: "anchor_playlist",
    },
    {
        position: 1,
        videoId: "def90123456",
        title: "Arrays and Linked Lists",
        channelName: "Tech Channel",
        durationSeconds: 900,
        durationDisplay: "15:00",
        topicMatched: "Arrays and Linked Lists",
        source: "gap_fill",
    },
];

const mockResult: PlaylistResult = {
    syllabusTitle: "Data Structures & Algorithms",
    totalVideos: 2,
    totalDurationMinutes: 35,
    entries: mockEntries,
    watchUrl: "",
    preferences: defaultPrefs,
    generatedAt: new Date().toISOString(),
};

// Watch URL
const watchUrl = toWatchURL(["abc12345678", "def90123456"]);
assert(
    watchUrl === "https://www.youtube.com/watch_videos?video_ids=abc12345678,def90123456",
    "Watch URL is correct"
);
assert(toWatchURL([]) === "", "Empty watch URL returns empty string");

// CSV
const csv = toCSV(mockResult);
assert(csv.startsWith("Position,Title,Video URL"), "CSV has correct header");
assert(csv.includes("abc12345678"), "CSV contains video ID");

// Markdown
const md = toMarkdown(mockResult);
assert(md.includes("# 📚 Data Structures & Algorithms"), "Markdown has title");
assert(md.includes("abc12345678"), "Markdown contains video ID");

// Summary
const summary = generateSummary(mockResult);
assert(summary.includes("Data Structures & Algorithms"), "Summary contains title");
assert(summary.includes("from_scratch"), "Summary contains mode");

// ─── Test 5: Import Validation ────────────────────────
console.log("\n📋 Test 5: Import Validation (core modules)");

// These imports just validate the modules can be loaded
import("../core/gemini.js").then(() => assert(true, "gemini.ts imports OK")).catch(() => assert(false, "gemini.ts import"));
import("../core/safeJsonParser.js").then(() => assert(true, "safeJsonParser.ts imports OK")).catch(() => assert(false, "safeJsonParser.ts import"));
import("../core/searchScraper.js").then(() => assert(true, "searchScraper.ts imports OK")).catch(() => assert(false, "searchScraper.ts import"));
import("../core/queryIntelligence.js").then(() => assert(true, "queryIntelligence.ts imports OK")).catch(() => assert(false, "queryIntelligence.ts import"));

// ─── Results ──────────────────────────────────────────
// Wait for dynamic imports to resolve
setTimeout(() => {
    console.log(`\n${"═".repeat(50)}`);
    console.log(`🧪 Results: ${passed} passed, ${failed} failed`);
    console.log(`${"═".repeat(50)}\n`);

    if (failed > 0) {
        process.exit(1);
    }
}, 1000);
