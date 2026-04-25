# LoomOS by Qontext

LoomOS turns fragmented company records into a structured, inspectable enterprise memory system:
- virtual file system (`/customers`, `/employees`, `/projects`, `/policies`)
- relationship graph
- fact-level provenance
- confidence-based auto-updates
- human review for ambiguous changes

## Stack
- Next.js (App Router) + TypeScript + Tailwind
- Gemini (DeepMind) for extraction
- Tavily for enrichment/validation
- Supabase for persistence

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Current MVP Demo Flow

Use the `Run Next Demo Step` button repeatedly:

1. Baseline memory state in virtual file system
2. High-confidence source update auto-applies (`Sarah -> David`)
3. Ambiguous update goes to review queue (`<= 90%`)
4. Human approval applies queued fact

Use `Reset Demo State` before each live run.

## Environment Variables

Set these in `.env.local`:

- `GEMINI_API_KEY`
- `GEMINI_MODEL` (example: `gemini-2.5-pro`)
- `TAVILY_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENTIRE_API_KEY` (optional, recommended for partner #3)

See `.env.example` for the full template.

## Partner Technologies Used

- **Google DeepMind / Gemini**: `/api/extract` performs structured fact extraction.
- **Tavily**: `/api/extract` runs enrichment/verification and surfaces `External Verified`.
- **Supabase**: `/api/ingest` persists ingestion records and update history.
- **Entire (optional extension)**: planned for review queue collaboration workflow.

## Supabase Setup

1. Create a Supabase project.
2. Run SQL from `supabase/schema.sql` in SQL editor.
3. Add keys to `.env.local`.
4. Start app and run demo steps; each ingestion attempts persistence via `/api/ingest`.

## Docs Added in This Repo

- `KNOWLEDGE_BASE.md` - full hackathon strategy + architecture + test plan
- `EXECUTION_SPRINT.md` - hour-by-hour execution plan for fast delivery

## Verify

```bash
npm run lint
npm run build
```
