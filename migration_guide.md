# 🚀 Playlist Forge — Standalone Migration Guide

## Vision & Purpose

**Playlist Forge** is a Syllabus-to-YouTube-Playlist engine. A user uploads a syllabus screenshot → the engine extracts a table of contents → hunts for existing YouTube playlists → fills gaps with individually-searched videos → exports a ready-to-use YouTube playlist URL.

### The "Why"
Students waste hours manually searching YouTube topic-by-topic. This engine automates the entire process with intelligent search, quality filtering, and preference-aware curation.

### Core Intelligence (inherited from Learning Dojo)
- **Gemini Failover**: Dual-model (`gemini-2.5-flash` → `gemini-2.5-flash-lite`) with round-robin across multiple API keys
- **3-Layer Query Intelligence**: Deterministic query analysis (subject extraction, intent detection, relevance guard) — zero AI calls
- **Information Density Scoring**: Ranks videos by technical depth (description quality, duration, github links, anti-clickbait signals)
- **Vibe-Check Reranker**: Gemini-powered semantic reranking of top candidates
- **Video Vault**: Supabase caching with in-memory fallback to prevent redundant API calls
- **YouTube Data API Enrichment**: Fetches tags, categories, exact statistics for deeper ranking

### New Engine Logic
- **Syllabus OCR**: Gemini multimodal extracts structured TOC from screenshots (first-principles ordering)
- **Anchor Hunter**: Finds existing YouTube playlists using `yt-search` (free), scores coverage via `fuse.js` fuzzy matching
- **Gap Filler**: Identifies unmatched TOC items and surgically fills each with the full search pipeline
- **3 Learning Modes**: From Scratch (10-45min/topic), Revision (3-15min/topic), One-Shot (45min+ marathon)
- **Smart Export**: YouTube `watch_videos?video_ids=...` URL hack — zero API quota cost

---

## What To Copy

> [!IMPORTANT]
> Copy the **entire `playlist-forge/` folder** from `learning-dojo-copy/`. Everything inside is self-contained — no imports from the parent project.

### Complete File Manifest

```
playlist-forge/
├── package.json              # Dependencies & scripts
├── tsconfig.json             # TypeScript config (Node16 modules)
│
├── core/                     # 🧠 Algorithms (copied from Dojo, imports rewritten)
│   ├── types.ts              # All shared types & constants
│   ├── gemini.ts             # API key pool + dual-model failover
│   ├── safeJsonParser.ts     # Robust JSON parsing for LLM output
│   ├── searchScraper.ts      # VideoCandidate types, density scoring, duration filter
│   ├── queryIntelligence.ts  # 3-layer deterministic query analysis
│   ├── youtubeClient.ts      # YouTube Data API enrichment
│   ├── geminiReranker.ts     # Vibe-check reranker (imports: ./gemini, ./safeJsonParser)
│   └── videoVault.ts         # Supabase cache + in-memory fallback
│
├── engine/                   # 🏗️ New playlist logic
│   ├── preferences.ts        # User prefs → search modifiers (zero AI)
│   ├── syllabusExtractor.ts  # OCR + first-principles TOC extraction
│   ├── anchorHunter.ts       # Playlist discovery + fuzzy coverage scoring
│   ├── gapFiller.ts          # Gap detection + per-topic search + re-sequencing
│   ├── oneShotSearch.ts      # Marathon video search (exam mode)
│   ├── playlistBuilder.ts    # Main orchestrator (entry point)
│   └── exportPlaylist.ts     # URL hack + JSON/CSV/Markdown export
│
├── types/
│   └── yt-search.d.ts        # Type declarations for yt-search
│
└── test/
    └── smoke.ts              # 29 unit tests (zero API calls)
```

> [!CAUTION]
> Do NOT copy `node_modules/` or `package-lock.json` — run `npm install` fresh in the new project.

---

## Task List for New Project Setup

Paste this into the new chat window when setting up the standalone project:

```markdown
# Playlist Forge — Standalone Setup Checklist

## Phase 1: Project Initialization
- [ ] Create new project directory (e.g., `playlist-forge-app/`)
- [ ] Initialize with your preferred framework (Next.js for full UI, or plain Node.js)
- [ ] Copy the `core/`, `engine/`, `types/`, `test/` folders from the source
- [ ] Copy `tsconfig.json` from the source

## Phase 2: Dependencies
- [ ] Install production dependencies:
      npm install @google/generative-ai @supabase/supabase-js dotenv fuse.js yt-search
- [ ] Install dev dependencies:
      npm install -D typescript tsx @types/node
- [ ] Run `npm run typecheck` (or `npx tsc --noEmit`) to verify compilation

## Phase 3: Environment Variables (.env.local)
- [ ] GEMINI_API_KEY=your-primary-gemini-key
- [ ] GEMINI_API_KEY_2=your-secondary-gemini-key
- [ ] YOUTUBE_API_KEY=your-youtube-data-api-key
- [ ] SUPABASE_URL=your-new-supabase-project-url
- [ ] SUPABASE_KEY=your-new-supabase-anon-key

## Phase 4: Supabase Setup (New Project)
- [ ] Create a new Supabase project at supabase.com
- [ ] Run this SQL in the SQL Editor to create the video_vault table:

CREATE TABLE IF NOT EXISTS public.video_vault (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    video_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    transcript_snippet TEXT DEFAULT '',
    density_score REAL DEFAULT 0,
    density_flags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_video_vault_video_id ON public.video_vault(video_id);
CREATE INDEX idx_video_vault_metadata ON public.video_vault USING gin(metadata);

- [ ] Enable Row Level Security (RLS) on the table
- [ ] Update .env.local with the new project URL and anon key

## Phase 5: Smoke Test
- [ ] Run: npx tsx test/smoke.ts
- [ ] Verify all 29 tests pass

## Phase 6: Build UI
- [ ] Create upload interface (drag & drop syllabus image)
- [ ] Create preferences selector (student type, language, learning mode)
- [ ] Create playlist display (video list with YouTube links)
- [ ] Connect UI to playlistBuilder.ts entry points
```

---

## How The Failover Systems Work (Standalone)

### 🔑 Gemini Dual-Model + Multi-Key Failover

**File**: `core/gemini.ts`

```
Strategy:
  For each API call → round-robin pick a key → try gemini-2.5-flash → 
  if 429/fail → try gemini-2.5-flash-lite (same key) →
  if still fail → rotate to next key → repeat

Keys read from env:
  GEMINI_API_KEY      (primary — required)
  GEMINI_API_KEY_2    (optional — recommended)
  GEMINI_API_KEY_3..10 (optional — more = more resilience)

Total combos per call: numKeys × 2 models
With 2 keys: 4 attempts before failure
```

This is **fully standalone** — no Dojo dependency. It reads env vars directly.

### 📺 YouTube Data API Enrichment

**File**: `core/youtubeClient.ts`

```
Strategy:
  Reads YOUTUBE_API_KEY (or GOOGLE_API_KEY) from env
  Batches video IDs in chunks of 50
  Fetches: tags, categories, statistics, exact duration
  Fails gracefully: returns empty map if no key
  Cost: 1 quota unit per 50 videos (extremely cheap)
```

Fully standalone. Only needs the env var.

### 🗄️ Video Vault (Supabase Cache)

**File**: `core/videoVault.ts`

```
Strategy:
  ALWAYS uses in-memory cache (Map) — works with zero config
  IF SUPABASE_URL + SUPABASE_KEY exist → also persistently caches
  Graceful degradation: if Supabase fails, falls back to memory
  
  Table name: video_vault
  Unique key: video_id
  Stores: title, description, density_score, density_flags, metadata (JSONB)
```

Works standalone immediately — even without Supabase (memory cache kicks in).

### 🔍 Search Pipeline (Zero-Cost + Paid Tiers)

```
Tier 0 (FREE):    yt-search — unlimited searches, no API key needed
Tier 1 (FREE):    queryIntelligence — deterministic, zero API calls
Tier 2 (FREE):    searchScraper density scoring — pure math, no API
Tier 3 (CHEAP):   youtubeClient enrichment — 1 unit/50 videos
Tier 4 (OPTIONAL): geminiReranker — 1 Gemini call per topic (can be disabled)
```

---

## Quick Start — Usage After Migration

```typescript
import { buildPlaylistFromText } from "./engine/playlistBuilder.js";

const result = await buildPlaylistFromText({
    syllabusText: `
        Operating Systems:
        1. Process Management - Scheduling, Deadlocks
        2. Memory Management - Paging, Segmentation
        3. File Systems - FAT, NTFS, EXT4
        4. I/O Systems - Device Drivers, DMA
    `,
    preferences: {
        studentType: "undergrad",
        language: "hindi",
        learningMode: "from_scratch",
    },
});

// Open this URL → instant YouTube playlist
console.log(result.watchUrl);

// Or export as files
import { toCSV, toMarkdown, toJSON } from "./engine/exportPlaylist.js";
console.log(toCSV(result));
console.log(toMarkdown(result));
```

Or from an image:
```typescript
import { buildPlaylistFromImage } from "./engine/playlistBuilder.js";
import fs from "fs";

const result = await buildPlaylistFromImage({
    imageBuffer: fs.readFileSync("./syllabus.png"),
    mimeType: "image/png",
    preferences: {
        studentType: "high_school",
        language: "english",
        learningMode: "revision",
    },
});
```
