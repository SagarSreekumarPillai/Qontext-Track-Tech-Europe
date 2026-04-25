# Technical Documentation for Jury Evaluation

This document explains how the current LoomOS application works end-to-end so judges can evaluate architecture, technical depth, and implementation quality.

## System Purpose

LoomOS converts fragmented enterprise records into structured memory with:
- virtual file-system navigation of entities
- fact-level provenance metadata
- confidence-based automatic updates
- human review for ambiguous updates

## Architecture Overview

### Frontend
- Single-page interface in `src/app/page.tsx`.
- Core panels:
  - virtual file tree and entity files
  - fact and provenance viewer
  - review queue and update history
- Ingestion flows:
  - single-record ingestion form
  - bulk dataset ingestion from JSON/CSV
  - compatibility preview via API before ingest

### Backend API Layer
- `POST /api/import/preview`: validates and previews import compatibility.
- `POST /api/extract`: extraction + routing + enrichment.
- `POST /api/ingest`: persistence of raw records and update actions.

### Domain and State Layer
- `src/lib/qontext.ts` contains:
  - domain types (`RawRecord`, `Fact`, `ExtractedFact`, `QontextState`)
  - initial demo state
  - transition functions for extracted facts and review decisions
  - file-group derivation for the virtual filesystem panel

## Data Flow (Current Version)

1. User enters or uploads record data.
2. Frontend normalizes data into `RawRecord`.
3. App calls `POST /api/extract`.
4. Extraction response returns:
   - candidate facts
   - routing recommendation (`auto_apply` vs `review_queue`)
   - optional Tavily verification metadata
5. Frontend applies updates into in-memory state:
   - high-confidence facts auto-apply
   - ambiguous facts move to review queue
6. App calls `POST /api/ingest` to persist ingestion/update event when Supabase is configured.
7. Jury-visible UI updates:
   - fact cards and provenance
   - update history timeline
   - pending review queue

## Extraction and Routing Behavior

### Primary Extraction Path
- Gemini is used as primary extraction provider.

### Resilience/Fallback
- If Gemini returns no facts, app falls back to `alternate-engine`.
- If Gemini quota errors occur, route returns `degraded_mode` and fallback facts.

### Routing Logic
- Routing model inference adjusts confidence and decides:
  - `auto_apply` when sufficiently confident
  - `review_queue` when ambiguity risk is detected

## Persistence Model

When Supabase is configured:
- Raw records are upserted into `raw_records`.
- Update actions can be inserted into `update_history`.

When Supabase is not configured:
- API returns `persisted: false` with a reason.
- App behavior remains functional for live demo continuity.

## Import Compatibility and Adapters

Dataset payloads are parsed through import adapters in `src/lib/importAdapters.ts`:
- supports CSV and JSON style payloads
- detects compatible source format
- returns normalized records for ingestion flow

## What Judges Can Verify Quickly

- Virtual filesystem structure is the primary product surface.
- Facts include source metadata and confidence.
- Automatic vs human-governed update handling is visible in one run.
- API-backed extraction and optional persistence paths are integrated.

## Verification Commands

```bash
npm run lint
npm run build
```
