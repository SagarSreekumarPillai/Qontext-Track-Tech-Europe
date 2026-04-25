# QontextOS Domain Model Development Plan

This plan turns the current extraction stack into a measurable, trainable domain model pipeline suitable for hackathon execution.

## 1) Objective

Build a **task-specific extraction and routing model layer** that improves:

- fact validity precision
- ambiguity routing quality (auto-apply vs review queue)
- canonicalization consistency (entity type + fact key)

Target outcome for demo/judges:
- "We trained a domain model that reduces noisy facts and improves human-in-loop routing accuracy."

---

## 2) Scope (What We Will Build)

## 2.1 Trainable Components

1. **Fact Quality Classifier**
   - Input: `(source_type, source_id, raw_content, extracted_fact)`
   - Output: `valid_fact: true/false`

2. **Ambiguity Router Classifier**
   - Input: same as above + confidence + linguistic uncertainty features
   - Output: `route: auto_apply | review_queue`

3. **Canonical Key Classifier (optional if time)**
   - Input: raw extracted key + context
   - Output: canonical key (`account_owner`, `status`, `sla_hours`, etc.)

## 2.2 Runtime Integration

- Keep existing `/api/extract` primary flow.
- Add model inference post-processing stage:
  1) drop low-quality extracted facts
  2) calibrate confidence
  3) decide route with trained ambiguity model

---

## 3) Data Strategy

## 3.1 Data Sources for Training

1. **Internal extraction logs** (from your API usage)
2. **Synthetic records** generated per source type
3. **Teacher-labeled examples** (Gemini outputs + corrections)
4. **Human review outcomes** (approved/rejected queue decisions)

## 3.2 Label Schema

Per candidate fact:

- `is_valid_fact` (0/1)
- `is_ambiguous` (0/1)
- `should_auto_apply` (0/1)
- `canonical_fact_key` (string label)
- `canonical_entity_type` (label)

## 3.3 Dataset Split

- Train: 70%
- Validation: 15%
- Test: 15%

Stratify by source type:
- crm, email, hr, ticket, policy, collab, it, business

---

## 4) Feature Engineering

## 4.1 Core Features

- Source type one-hot
- Candidate confidence score
- Ambiguity indicators (`maybe`, `likely`, `during transition`, etc.)
- Content length and numeric density
- Fact key pattern features
- Entity/fact/value lexical consistency features

## 4.2 Quality Heuristics Features

- value-is-date/time + owner-fact mismatch
- repeated duplicate tuples
- unsupported key patterns
- business metric regex matches (`%`, `x`, currency, hours)

---

## 5) Model Choices (Hackathon-Realistic)

## 5.1 Preferred stack

- Python + scikit-learn
- `LogisticRegression` or `LightGBM` (if available)
- fast inference and easy explainability

## 5.2 Why

- Fast to train
- Transparent coefficients/feature importance
- Easy to ship in API runtime

---

## 6) Implementation Steps

## Phase A: Data Pipeline (1-2 hours)

1. Add `scripts/build_training_set.ts`
   - Export extracted facts + outcomes to JSONL/CSV
2. Add `data/training/` folder convention:
   - `raw_candidates.jsonl`
   - `labeled_candidates.csv`

Deliverable:
- reproducible dataset export command

## Phase B: Labeling + Synthetic Expansion (1-2 hours)

1. Add `scripts/generate_synthetic_records.ts`
2. Add `scripts/label_bootstrap.py`
   - weak supervision labels from heuristics + teacher output
3. Manual review of 100-200 examples (high-impact set)

Deliverable:
- `labeled_candidates.csv` with enough class balance

## Phase C: Train + Evaluate (1-2 hours)

1. Add `scripts/train_router_model.py`
2. Add `scripts/eval_router_model.py`
3. Save artifacts:
   - `artifacts/router_model.pkl`
   - `artifacts/metrics.json`

Deliverable:
- clear test metrics dashboard

## Phase D: Runtime Integration (1 hour)

1. Add `src/lib/server/modelInference.ts`
2. Load model artifact or fallback to heuristic policy
3. Integrate into `/api/extract` flow

Deliverable:
- API response includes `routing_model: enabled`

## Phase E: Demo + Validation (1 hour)

1. Run benchmark suite on practical records
2. Compare:
   - before model vs after model
3. Document gains in README submission section

Deliverable:
- judge-ready evidence of improvement

---

## 7) Testing Plan

## 7.1 Unit Tests

- feature extraction correctness
- canonical key normalization
- route decision threshold logic

## 7.2 Integration Tests

- `/api/extract` with model on/off
- end-to-end queue behavior:
  - ambiguous facts => review queue
  - clear facts => auto apply

## 7.3 Regression Tests

Curated record suite by source type:
- 5 records each x 8 source types = 40 cases
- expected:
  - valid facts produced
  - route decision correctness

## 7.4 Performance Tests

- extraction latency budget:
  - p50 < 1.5s
  - p95 < 3.5s (excluding external model latency spikes)

---

## 8) Evaluation Metrics (Must Report)

## Fact Quality
- Precision
- Recall
- F1

## Routing
- Accuracy (auto vs queue)
- False auto-apply rate (critical)
- Queue precision (how often queued items are truly ambiguous)

## Canonicalization
- Fact key normalization accuracy
- Entity type classification accuracy

Success thresholds (hackathon practical):
- Fact precision >= 0.85
- Routing accuracy >= 0.85
- False auto-apply <= 0.08

---

## 9) Refinement Loop

Daily loop:
1. collect model errors
2. label new hard cases
3. retrain
4. compare metrics
5. deploy if improved

Prioritize errors:
1. Wrong auto-apply (highest risk)
2. Missing critical facts
3. Wrong entity/fact canonicalization

---

## 10) Demo Narrative for “Own Model” Claim

Use this framing:

1. "We started with general extraction."
2. "We trained a domain routing model on enterprise records + review outcomes."
3. "It improved precision and reduced unsafe auto-updates."
4. "Human review now triggers only for meaningful ambiguity."

Show:
- before/after metrics table
- one concrete failure fixed by trained model

---

## 11) Immediate Task Board

1. Create dataset export script
2. Generate + label training examples
3. Train router model
4. Integrate model inference in `/api/extract`
5. Run benchmark + produce metrics artifact
6. Update submission text with evidence

---

## 12) Risks and Mitigations

- **Low sample quality**
  - Mitigation: manual label pass on top 100 hard examples
- **Class imbalance**
  - Mitigation: oversample ambiguous/negative cases
- **Overfitting**
  - Mitigation: source-stratified test split + holdout records
- **Time pressure**
  - Mitigation: ship classifier + metrics first, canonical classifier optional

---

## 13) Definition of Done

Done when all are true:
- model artifact is generated reproducibly
- metrics.json exists with test split scores
- API uses model output in routing
- benchmark suite shows measurable improvement
- README includes model methodology + results

