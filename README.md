# LoomOS by Qontext

LoomOS turns fragmented company records into a structured, inspectable enterprise memory system:
- virtual file system (`/customers`, `/employees`, `/projects`, `/policies`)
- relationship graph
- fact-level provenance
- confidence-based auto-updates
- human review for ambiguous changes

## Table of Contents
- [Repository Requirements Checklist](#repository-requirements-checklist)
- [Setup and Installation](#setup-and-installation)
- [Environment Variables](#environment-variables)
- [Run and Verify](#run-and-verify)
- [Demo Flow](#demo-flow)
- [Technical Documentation Index](#technical-documentation-index)

## Repository Requirements Checklist
- **Comprehensive README with setup and installation instructions:** included in this file.
- **Clear documentation of all APIs, frameworks, and tools utilized:** see `API Documentation` and `Frameworks and Tools Used` below.
- **Sufficient technical documentation for jury evaluation:** see `Technical Documentation Index`.

## Setup and Installation

### Prerequisites
- Node.js 20+
- npm 10+
- Supabase project (for persistence paths)
- Gemini API key
- Tavily API key

### Install
```bash
npm install
cp .env.example .env.local
```

### Configure
1. Fill all required keys in `.env.local` (see section below).
2. If using Supabase, run database SQL from `supabase/schema.sql`.

### Start Development Server
```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

Set these in `.env.local`:
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (example: `gemini-2.5-pro`)
- `TAVILY_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENTIRE_API_KEY` (optional, partner #3 extension path)

See `.env.example` for the full template.

## Run and Verify

### Development
```bash
npm run dev
```

### Quality Checks
```bash
npm run lint
npm run build
```

### Optional Model and Benchmark Scripts
```bash
npm run data:generate
npm run model:train
npm run model:eval
npm run benchmark:extract
```

## Demo Flow

Use the `Run Next Demo Step` button repeatedly:
1. Baseline memory state in virtual file system.
2. High-confidence source update auto-applies (`Sarah -> David`).
3. Ambiguous update goes to review queue (`<= 90%` confidence path).
4. Human approval applies queued fact.

Use `Reset Demo State` before each live run.

## Technical Documentation Index
- `API_FRAMEWORKS_TOOLS.md`: complete API reference and stack/tooling documentation.
- `TECHNICAL_DOCUMENTATION.md`: architecture, data flow, model/routing behavior, and jury evaluation guidance.
