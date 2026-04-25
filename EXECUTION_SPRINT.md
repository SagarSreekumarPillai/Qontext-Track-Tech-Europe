# QontextOS 8-Hour Execution Sprint

## Hour 0-1: Stabilize Demo Surface
- Run app and verify three-panel UX.
- Validate scripted demo flow buttons:
  - baseline selection
  - high-confidence auto-update
  - low-confidence queue
  - approve flow

## Hour 1-2: Gemini Extractor
- Add `/api/extract` route.
- Input: raw record.
- Output: strict JSON extracted facts.
- Add schema validation and fallback parser.

## Hour 2-3: Supabase Schema + Persistence
- Create tables for `raw_records`, `entities`, `memory_facts`, `fact_provenance`, `relationships`, `review_queue`, `update_history`.
- Implement repository functions and wire to ingest/update.

## Hour 3-4: Tavily Enrichment
- Add optional enrichment pass for uncertain entities/terms.
- Surface `External Verified` badge for enriched facts.

## Hour 4-5: Human Review Hardening
- Approve/reject idempotency.
- Better reason labels for queue entries.
- Add concise update diff cards.

## Hour 5-6: Demo Reliability
- Seed reset endpoint.
- Freeze deterministic mock sequence for live demo.
- Add one-click "Reset Demo State".

## Hour 6-7: Testing
- Unit: confidence router and conflict resolver.
- Integration: ingest -> extract -> apply/queue -> approve/reject.
- Rehearse 90-second script 3 times.

## Hour 7-8: Submission Readiness
- Final README with architecture + partner tech evidence.
- Screenshot/video backup.
- Side challenge evidence if applicable.
