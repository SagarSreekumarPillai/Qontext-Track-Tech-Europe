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
- [API Documentation](#api-documentation)
- [Frameworks and Tools Used](#frameworks-and-tools-used)
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

## API Documentation

### `POST /api/import/preview`
Parses imported dataset payloads and returns adapter-detected preview results.

**Request body**
- `payload` (string, required): raw dataset payload.
- `fileName` (string, optional): used by adapter detection.

**Response**
- `ok` (boolean)
- `adapter` (string): selected adapter.
- `count` (number): parsed records count.
- `preview` (array): first 3 parsed records.

### `POST /api/extract`
Extracts candidate facts from source content, applies routing inference, and optionally enriches with Tavily.

**Request body**
- `sourceType` (enum): `crm | email | hr | ticket | policy | collab | it | business`
- `sourceId` (string, required)
- `content` (string, required)

**Response**
- `ok` (boolean)
- `facts` (array): extracted and route-scored facts
- `enrichment` (object): Tavily verification payload
- `provider` (`gemini` or `alternate-engine`)
- `routing_model` (`enabled`)
- `degraded_mode` (optional, set when Gemini quota fallback is used)

### `POST /api/ingest`
Persists raw record ingestion to Supabase and optionally logs update history events.

**Request body**
- `record` (object, required): `{ id, sourceType, sourceId, content, timestamp }`
- `action` (optional): `auto_applied | queued | approved | rejected`
- `factKey` (optional)
- `oldValue` (optional)
- `newValue` (optional)

**Response**
- `ok` (boolean)
- `persisted` (boolean)
- `reason` (optional): returned when Supabase is not configured

## Frameworks and Tools Used

### Core Application Framework
- **Next.js 16 (App Router):** web application framework and API runtime.
- **React 19:** component/UI model.
- **TypeScript 5:** type safety across UI, API, and data contracts.
- **Tailwind CSS 4:** styling and design system utility layer.

### AI and Data Integrations
- **Google DeepMind Gemini (`@google/genai`):** fact extraction from unstructured records.
- **Tavily:** external enrichment/verification for selected facts.
- **Supabase (`@supabase/supabase-js`):** persistence for raw records and update history.
- **Zod:** request payload validation and schema checks.

### Tooling and Quality
- **ESLint + `eslint-config-next`:** linting and code quality checks.
- **Next build pipeline (`npm run build`):** production build validation.

## Technical Documentation Index
- `KNOWLEDGE_BASE.md`: end-to-end architecture, requirement mapping, schema guidance, and implementation strategy.
- `MODEL_DEVELOPMENT_PLAN.md`: routing-model data generation, training, evaluation, and rollout plan.
- `EXECUTION_SPRINT.md`: delivery timeline and execution sequencing for hackathon constraints.
- `SUBMISSION_ALIGNMENT.md`: gap analysis against track requirements and completion checklist.

## Partner Technology Mapping (Submission Evidence)
- **Google DeepMind / Gemini:** used in `POST /api/extract` for structured fact extraction.
- **Tavily:** used in `POST /api/extract` enrichment flow for external verification.
- **Supabase:** used in `POST /api/ingest` for persistence of ingestion and update logs.
- **Entire (optional extension):** reserved integration path for review workflow collaboration.
