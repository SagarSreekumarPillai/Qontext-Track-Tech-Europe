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

## Dataset Access Note (Hackathon Constraint)

For this submission, direct dataset API access was not consistently available during implementation/testing (gated/auth-dependent access and quota friction in live environment).  
To keep the system verifiable and demo-stable, we used a **local mirror of the official Qontext dataset files** in:

- `Dataset From Qontext/Dataset`

The import pipeline was intentionally built to remain connector-compatible and format-agnostic:
- direct JSON/CSV payload ingest
- platform-style export adapters (Salesforce/HubSpot/Zendesk/Jira/Slack patterns)
- compatibility preview + data quality diagnostics before ingest

This means the current approach is a practical fallback for hackathon reliability, while preserving compatibility with direct API/connector ingestion.

## Judge Quick Start

Use this sequence to verify end-to-end ingestion and live state updates:

1. Start app and open `http://localhost:3000`.
2. In **Dynamic Dataset Ingestion**:
   - upload a real file from `Dataset From Qontext/Dataset` (example: `IT_Service_Management/it_tickets.json` or `Business_and_Management/clients.json`)
   - click **Validate Import Compatibility** and confirm adapter + Data Quality Report appear.
3. Click **Ingest Dataset Payload**.
4. Verify live changes across panels:
   - **Left**: incoming records list grows with newly ingested records
   - **Center**: virtual file system and memory facts update for newly inferred entities
   - **Right**: provenance/graph/review queue/update history reflect new extracted facts and decisions
5. Repeat with a different source category (e.g. HR or CRM file) and confirm metrics/relationships change again.

What this demonstrates:
- records are parsed from external dataset files at runtime
- extraction and routing occur on the ingested content
- provenance and update history are generated dynamically
- the system state evolves with each new import (not pre-scripted static data)

## Technical Documentation Index
- `API_FRAMEWORKS_TOOLS.md`: complete API reference and stack/tooling documentation.
- `TECHNICAL_DOCUMENTATION.md`: architecture, data flow, model/routing behavior, and jury evaluation guidance.
