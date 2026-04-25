#!/usr/bin/env python3
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "training" / "labeled_candidates.jsonl"
MODEL_PATH = ROOT / "artifacts" / "router_model.json"


def sigmoid(x):
    if x < -35:
        return 0.0
    if x > 35:
        return 1.0
    return 1.0 / (1.0 + math.exp(-x))


def normalize(text: str) -> str:
    return text.lower()


def featurize(row):
    content = normalize(row["content"])
    fact = normalize(row["fact"])
    value = normalize(str(row["value"]))
    return {
        "confidence": float(row["confidence"]),
        "has_ambiguity_reason": 1.0 if row.get("ambiguityReason", "").strip() else 0.0,
        "source_email": 1.0 if row["sourceType"] == "email" else 0.0,
        "source_ticket": 1.0 if row["sourceType"] == "ticket" else 0.0,
        "source_hr": 1.0 if row["sourceType"] == "hr" else 0.0,
        "source_it": 1.0 if row["sourceType"] == "it" else 0.0,
        "source_business": 1.0 if row["sourceType"] == "business" else 0.0,
        "contains_maybe": 1.0 if "maybe" in content else 0.0,
        "contains_transition": 1.0 if "transition" in content else 0.0,
        "contains_likely": 1.0 if "likely" in content else 0.0,
        "contains_incident": 1.0 if "incident" in content else 0.0,
        "contains_blocker": 1.0 if "blocker" in content else 0.0,
        "contains_risk": 1.0 if "risk" in content else 0.0,
        "fact_is_owner": 1.0 if ("owner" in fact or "owns" in fact) else 0.0,
        "fact_is_sla_or_slo": 1.0 if ("sla" in fact or "slo" in fact) else 0.0,
        "fact_is_dependency": 1.0 if "dependency" in fact else 0.0,
        "value_has_percent": 1.0 if "%" in value else 0.0,
        "value_has_currency": 1.0 if ("$" in value or "€" in value) else 0.0,
        "value_has_date_like": 1.0 if any(ch.isdigit() for ch in value) and "-" in value else 0.0,
    }


def main():
    rows = [json.loads(line) for line in DATA_PATH.read_text().splitlines() if line.strip()]
    model = json.loads(MODEL_PATH.read_text())
    names = model["featureOrder"]
    weights = model["weights"]
    bias = model["bias"]
    threshold = model.get("threshold", 0.55)

    tp = fp = tn = fn = 0
    for row in rows:
        features = featurize(row)
        x = [features.get(name, 0.0) for name in names]
        z = bias + sum(w * xi for w, xi in zip(weights, x))
        p = sigmoid(z)
        pred = 1 if p >= threshold else 0
        y = int(row["shouldAutoApply"])
        if pred == 1 and y == 1:
            tp += 1
        elif pred == 1 and y == 0:
            fp += 1
        elif pred == 0 and y == 0:
            tn += 1
        else:
            fn += 1

    total = max(1, tp + fp + tn + fn)
    accuracy = (tp + tn) / total
    precision = tp / max(1, tp + fp)
    recall = tp / max(1, tp + fn)
    f1 = 0.0 if precision + recall == 0 else (2 * precision * recall) / (precision + recall)

    print(
        json.dumps(
            {
                "accuracy": round(accuracy, 4),
                "precision": round(precision, 4),
                "recall": round(recall, 4),
                "f1": round(f1, 4),
                "tp": tp,
                "fp": fp,
                "tn": tn,
                "fn": fn,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
