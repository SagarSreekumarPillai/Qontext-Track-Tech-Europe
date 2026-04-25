# API, Frameworks, and Tools Documentation

This document is the canonical reference for APIs, frameworks, and tools used in the current application version.

## API Endpoints

### `POST /api/import/preview`
Preview adapter compatibility for pasted or uploaded datasets.

**Request body**
- `payload` (string, required): dataset content (CSV or JSON).
- `fileName` (string, optional): improves adapter detection.

**Response**
- `ok` (boolean)
- `adapter` (string): chosen adapter name.
- `count` (number): number of parsed records.
- `preview` (array): first few normalized records.

### `POST /api/extract`
Extract facts from a raw record, run routing inference, and optionally enrich with Tavily.

**Request body**
- `sourceType` (enum): `crm | email | hr | ticket | policy | collab | it | business`
- `sourceId` (string, required)
- `content` (string, required)

**Response**
- `ok` (boolean)
- `facts` (array): extracted facts with confidence and routing fields
- `enrichment` (object): includes `verified` and optional `sourceUrl`
- `provider` (`gemini` or `alternate-engine`)
- `routing_model` (`enabled`)
- `degraded_mode` (optional): set when Gemini quota fallback path is used

### `POST /api/ingest`
Persist ingestion records and optional update-history events to Supabase.

**Request body**
- `record` (object, required): `{ id, sourceType, sourceId, content, timestamp }`
- `action` (optional): `auto_applied | queued | approved | rejected`
- `factKey` (optional)
- `oldValue` (optional)
- `newValue` (optional)

**Response**
- `ok` (boolean)
- `persisted` (boolean)
- `reason` (optional): explains non-persistence when Supabase is not configured

## Frameworks

- **Next.js 16 (App Router):** frontend and API runtime.
- **React 19:** UI and stateful interaction layer.
- **TypeScript 5:** typing for frontend, API handlers, and domain models.
- **Tailwind CSS 4:** utility-first styling and layout system.

## Libraries and Integrations

- **`@google/genai`:** Gemini integration for structured fact extraction.
- **Tavily API:** external verification/enrichment for high-confidence facts.
- **`@supabase/supabase-js`:** persistence client for `raw_records` and `update_history`.
- **`zod`:** request schema validation for API payload safety.

## Developer Tooling

- **ESLint 9 + `eslint-config-next`:** static analysis and style consistency.
- **Next.js build pipeline (`npm run build`):** production compatibility validation.
- **Custom scripts**
  - `npm run data:generate`
  - `npm run model:train`
  - `npm run model:eval`
  - `npm run benchmark:extract`

## Environment Dependencies

Required environment variables:
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `TAVILY_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:
- `ENTIRE_API_KEY`
