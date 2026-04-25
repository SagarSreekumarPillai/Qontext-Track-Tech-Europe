# Qontext Hackathon Winning Knowledge Base

## 0) Best Product Name (Lovable + Judge-Friendly)

Primary name recommendation: **LoomOS by Qontext**

- Why it works:
  - **Loom** = weaving fragmented threads into one coherent fabric (perfect metaphor for fragmented enterprise data).
  - **OS** = reinforces your “operating system for company memory” positioning.
  - Sounds human and brandable while still technical.

Fallback options:
- **ContextLoom**
- **FactOS**
- **TraceGrid**
- **MemoryMesh**

Suggested pitch line:
> **LoomOS turns fragmented enterprise records into a living, inspectable memory graph with fact-level provenance and human governance.**

---

## 1) What Judges Need to Understand in 90 Seconds

Your product wins if judges immediately “get” these five truths:

1. **Raw fragments in**: CRM/email/HR/ticket/policy events arrive as messy records.
2. **Structured memory out**: records become entity files in a virtual file system.
3. **Trust by design**: every fact is provenance-backed and confidence-scored.
4. **Auto-maintained**: high-confidence updates apply automatically and update relationships.
5. **Human control where ambiguity matters**: uncertain/conflicting updates enter review queue.

If any one of these is unclear in the UI, your score drops.

---

## 2) Challenge-to-Feature Mapping (Directly Aligned)

### Track requirement: “Virtual file system + graph”
Implement:
- Left panel file tree (`/customers`, `/employees`, `/projects`, `/tasks`, `/policies`, `/processes`)
- Right panel relationship graph and linked entities

### Track requirement: “Provenance at fact level”
Implement:
- Fact cards showing `sourceType`, `sourceId`, `confidence`, `timestamp`
- Expandable “evidence” drawer with raw source snippet

### Track requirement: “Resolve easy conflicts automatically; involve humans where needed”
Implement:
- Confidence threshold rule:
  - `> 0.90` auto-apply
  - `<= 0.90` review queue item (approve/reject)

### Track requirement: “Generalizable beyond dataset”
Implement:
- Source adapters (CRM/email/HR/ticket/policy) with common ingestion schema
- Entity extraction pipeline isolated behind one extractor interface

---

## 3) Mandatory Partner Tech Strategy (Use Any 3)

You already must use:
- **Google DeepMind / Gemini**
- **Tavily**

Pick a practical third for the “3 partner technologies” requirement:
- **Entire** (recommended easiest meaningful integration)
  - Use it for agent-human collaboration workflow around review queue and audit trails.

Alternative third:
- **Gradium** only if you can make voice review materially useful.
- **Lovable** only if you can show generated UI artifacts in pipeline credibly.
- **Pioneer** if you target side challenge and have enough time for fine-tune/eval.

Recommended combo for reliability + scoring:
1. Gemini
2. Tavily
3. Entire

---

## 4) Product Scope: MVP That Feels Real (Not a Chatbot)

### Core UX Surfaces
- **Left panel**: virtual file system (main product surface)
- **Center panel**: memory file viewer (hero evidence of structure)
- **Right panel**: provenance + graph + update history + review queue

### Core Objects
- `RawRecord` (fragment)
- `FactCandidate` (extracted statement + confidence)
- `MemoryFact` (accepted canonical fact with provenance)
- `EntityFile` (rendered memory view)
- `RelationshipEdge` (graph)
- `ReviewItem` (ambiguous update)

### Anti-patterns to avoid
- No chatbot interface as primary surface
- No “RAG answer box” as core product
- No flat markdown dump without explainability controls

---

## 5) Reference Technical Architecture (Demo-First)

### Frontend
- Next.js App Router + TypeScript + Tailwind
- Real-time-ish UI with optimistic animations for ingestion/update events
- Client state for selected file/fact + review queue interactions

### Backend (within Next.js + Supabase)
- API routes/server actions:
  - `/api/ingest`
  - `/api/extract`
  - `/api/apply-update`
  - `/api/review/approve`
  - `/api/review/reject`
- Supabase Postgres for persistence
- Supabase Realtime (optional) to animate new events

### AI and enrichment
- Gemini:
  - fact extraction
  - entity typing
  - confidence assignment
  - ambiguity/conflict signals
- Tavily:
  - external validation/enrichment (company data hints, policy references, terminology disambiguation)
  - use sparingly and visibly (show when Tavily was consulted)

### Optional collaboration integration
- Entire:
  - human-agent collaboration on queued ambiguity cases
  - export review logs/audits

---

## 6) Canonical Data Model (Practical Supabase Schema)

Use this as your baseline schema:

- `raw_records`
  - `id (uuid)`
  - `source_type (crm|email|hr|ticket|policy)`
  - `source_id (text)`
  - `content (text)`
  - `timestamp (timestamptz)`
  - `ingested_at (timestamptz default now())`

- `entities`
  - `id (uuid)`
  - `entity_type (employee|customer|project|task|policy|process)`
  - `slug (text unique)`  // e.g. `acme`, `sarah`
  - `display_name (text)`
  - `summary (text)`
  - `updated_at (timestamptz)`

- `memory_facts`
  - `id (uuid)`
  - `entity_id (fk entities.id)`
  - `fact_key (text)`      // e.g. `account_owner`
  - `fact_value (jsonb)`   // string or object
  - `status (active|superseded|pending_review)`
  - `confidence (numeric)`
  - `updated_at (timestamptz)`

- `fact_provenance`
  - `id (uuid)`
  - `fact_id (fk memory_facts.id)`
  - `raw_record_id (fk raw_records.id)`
  - `source_type (text)`
  - `source_id (text)`
  - `evidence_snippet (text)`
  - `extracted_at (timestamptz)`

- `relationships`
  - `id (uuid)`
  - `from_entity_id (fk entities.id)`
  - `relation (text)`      // owns, linked_to, part_of, applies_to
  - `to_entity_id (fk entities.id)`
  - `confidence (numeric)`
  - `updated_at (timestamptz)`

- `review_queue`
  - `id (uuid)`
  - `entity_id (fk entities.id)`
  - `fact_key (text)`
  - `old_value (jsonb)`
  - `proposed_value (jsonb)`
  - `confidence (numeric)`
  - `reason (text)`        // ambiguity/conflict
  - `raw_record_id (fk raw_records.id)`
  - `status (pending|approved|rejected)`
  - `created_at (timestamptz)`
  - `resolved_at (timestamptz)`

- `update_history`
  - `id (uuid)`
  - `entity_id (fk entities.id)`
  - `fact_key (text)`
  - `action (auto_applied|queued|approved|rejected|superseded)`
  - `before_value (jsonb)`
  - `after_value (jsonb)`
  - `actor (system|human)`
  - `created_at (timestamptz)`

---

## 7) API Setup Runbook (Step-by-Step)

## 7.1 Gemini (Google DeepMind)

1. Create Google AI project + generate API key.
2. Add env var:
   - `GEMINI_API_KEY=...`
3. Use a structured output prompt to force JSON:
   - Input: source content + source metadata.
   - Output: list of extracted facts with `entityType/entityId/fact/value/confidence/ambiguity`.
4. Validate response schema server-side with `zod`.
5. Log raw model responses for debugging (never expose sensitive tokens in UI).

Minimal extraction contract:
```ts
type ExtractedFact = {
  entityType: "employee" | "customer" | "project" | "task" | "policy" | "process";
  entityId: string;
  fact: string;
  value: string;
  confidence: number; // 0..1
  ambiguityReason?: string;
};
```

## 7.2 Tavily

1. Sign up at Tavily.
2. Add env var:
   - `TAVILY_API_KEY=...`
3. Use Tavily only for explicit enrichment checks:
   - normalizing organization names
   - confirming policy/industry terms
   - augmenting missing relationship clues
4. Mark enriched facts in UI with `External Verified` badge.

## 7.3 Supabase

1. Create Supabase project.
2. Copy:
   - `NEXT_PUBLIC_SUPABASE_URL=...`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
   - `SUPABASE_SERVICE_ROLE_KEY=...` (server only)
3. Create tables from schema above.
4. Enable Row Level Security where needed; for hackathon speed, keep internal demo auth simple.
5. Seed mock records into `raw_records`.

## 7.4 Entire (recommended 3rd partner integration)

1. Install Entire CLI/tools.
2. Connect project and define human-agent workflow for queue triage.
3. Attach review events (`review_queue`) and decisions (`approved/rejected`) as collaboration artifacts.
4. Demo one ambiguity case routed through this workflow.

---

## 8) End-to-End Pipeline (Exact Behavior)

1. **Ingest**
   - Receive `RawRecord`.
2. **Extract**
   - Gemini returns `FactCandidate[]`.
3. **Normalize**
   - Upsert canonical entity.
4. **Conflict check**
   - Compare incoming candidate vs active fact for same `entity + fact_key`.
5. **Decision**
   - If no conflict and confidence high -> apply.
   - If conflict and confidence high -> supersede old fact.
   - If low confidence/ambiguous -> push to `review_queue`.
6. **Provenance attach**
   - Always write `fact_provenance`.
7. **Relationship update**
   - Recompute or upsert graph edges affected by fact change.
8. **History write**
   - Persist event in `update_history`.
9. **UI notify**
   - animate change in file viewer and inspector.

---

## 9) Development Phases (Build + Test in Parallel)

## Phase 1: Dashboard shell
Build:
- Three-column responsive layout.
- Panel titles + placeholders.
Test:
- visual layout checks desktop + laptop.
- keyboard tab navigation between panels.

## Phase 2: Mock fragmented data stream
Build:
- hardcoded mock source records list.
- “simulate incoming record” control.
Test:
- record timestamps sorting
- source badges render correctly

## Phase 3: Virtual file system
Build:
- folder tree + expandable nodes.
- click file loads selected entity.
Test:
- folder expand/collapse
- selection state persistence

## Phase 4: Memory file viewer
Build:
- structured sections: summary, linked entities, tasks, policies, tickets.
- fact cards with confidence + source badge.
Test:
- empty-state rendering
- long text truncation and readability

## Phase 5: Provenance inspector
Build:
- right panel details for selected fact.
- evidence snippet and source record link.
Test:
- selecting different facts updates inspector correctly
- timestamp formatting consistency

## Phase 6: Relationship graph
Build:
- lightweight node-edge view (or chips fallback).
- relation labels (`owns`, `linked_to`, etc.).
Test:
- graph updates when selected entity changes
- no duplicate edges on re-render

## Phase 7: Auto-update simulation
Build:
- trigger update event: `Acme owner Sarah -> David`.
- animate changed field and history timeline entry.
Test:
- fact superseded correctly
- provenance includes new source

## Phase 8: Human review queue
Build:
- pending cards with old/new/confidence/source.
- approve/reject actions.
Test:
- approve writes fact + history
- reject keeps old fact intact

## Phase 9: Gemini integration
Build:
- replace mock extractor with Gemini call.
- schema-validated JSON extraction.
Test:
- malformed model output handling
- latency fallback states

## Phase 10: Supabase persistence
Build:
- migrate from in-memory to DB-backed state.
- optional realtime subscription for updates.
Test:
- app reload preserves state
- ingestion -> extraction -> review loop persists end-to-end

---

## 10) Testing Strategy (Fast but Convincing)

### A. Unit tests
- fact conflict resolver (threshold logic)
- entity normalization helpers
- provenance formatter

### B. Integration tests
- ingest API -> extraction -> persistence
- approve/reject queue flow
- auto-update graph edges

### C. Demo scenario tests (must pass every run)
1. Initial fragmented records visible.
2. Files generated and selectable.
3. Provenance for selected fact visible.
4. High-confidence update auto-applies.
5. Ambiguous update enters queue.
6. Human approval changes final state.

### D. Non-functional checks
- UI readable from projector distance
- no panel jank on updates
- no dead buttons in critical demo path

---

## 11) 90-Second Demo Script (Judge-Optimized)

1. “Here are fragmented records from CRM, tickets, policy docs.”
2. “LoomOS converts them into a navigable company memory file system.”
3. Open `/customers/acme.md`.
4. “Each fact has confidence and source provenance.”
5. Click `Account Owner`.
6. “Inspector shows evidence: CRM #102, confidence 95%.”
7. Trigger source update `David owns Acme`.
8. “High confidence, so LoomOS auto-updates file + graph.”
9. Trigger ambiguous email update (62%).
10. “Low confidence goes to review queue; human approves/rejects.”
11. Close with one-line value prop.

---

## 12) Scoring Boosters (High ROI)

- Add “trust chips” everywhere:
  - `Auto-Applied`
  - `Human-Reviewed`
  - `External Verified`
  - `Low Confidence`
- Show “what changed” diff inline when fact updates.
- Add “last synchronized at” indicator in header.
- Keep one-click “Reset Demo Data” for reliable live run.

---

## 13) Side Challenge Strategy (Optional)

### If targeting Fastino/Pioneer prize
- Use Pioneer to fine-tune conflict classifier:
  - Input: fact candidates + context
  - Output: apply vs queue decision
- Evaluate against Gemini baseline and show uplift.

### If targeting Aikido security prize
- Connect repo early.
- Fix high/critical findings before submission.
- capture required screenshot with issue categories.

### If targeting Gradium prize
- Add voice-based review actions:
  - “approve update #17”
  - “show provenance for owner fact”

---

## 14) Team Execution Plan (Hackathon Reality)

Recommended role split (3 people):
- **Builder A (Frontend UX):** 3-panel UI + file viewer + review queue
- **Builder B (Data/Backend):** schema + pipeline + update logic + APIs
- **Builder C (AI/Integrations):** Gemini extraction + Tavily enrichment + Entire workflow + demo orchestration

If 2 people:
- Person 1: Frontend + demo polish
- Person 2: Backend + AI + integrations

---

## 15) Delivery Checklist Before Submission

- [ ] Product name and one-line value proposition finalized
- [ ] Mandatory 3 partner technologies clearly used and listed
- [ ] 90-second demo path rehearsed 3x without failure
- [ ] All five proof points visible in UI
- [ ] README includes architecture + setup + demo commands
- [ ] Short video/gif backup in case live demo hiccups

---

## 16) Suggested README “Winning” Intro

**LoomOS is an operating system for company memory.**
It ingests fragmented enterprise records (CRM, email, HR, tickets, policies), converts them into structured entity files and a relationship graph, preserves fact-level provenance, auto-applies high-confidence updates, and routes ambiguity to human review.

---

## 17) Practical Next Actions (Do This Now)

1. Scaffold Next.js + Tailwind + TypeScript app.
2. Build Phase 1-5 with mock data in one sprint.
3. Integrate Gemini extraction next.
4. Add Supabase persistence.
5. Finish auto-update + review queue + demo script.
6. Add Entire integration and explicitly document it as partner #3.

This order maximizes demo clarity earliest and reduces integration risk near submission.

