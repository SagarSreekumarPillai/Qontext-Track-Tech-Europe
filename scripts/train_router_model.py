#!/usr/bin/env python3
import json
import math
import os
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "training" / "labeled_candidates.jsonl"
ARTIFACT_DIR = ROOT / "artifacts"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

FEATURE_ORDER = [
    "confidence",
    "has_ambiguity_reason",
    "source_email",
    "source_ticket",
    "source_hr",
    "source_it",
    "source_business",
    "contains_maybe",
    "contains_transition",
    "contains_likely",
    "contains_incident",
    "contains_blocker",
    "contains_risk",
    "fact_is_owner",
    "fact_is_sla_or_slo",
    "fact_is_dependency",
    "value_has_percent",
    "value_has_currency",
    "value_has_date_like",
]


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


def vectorize(feature_map):
    return [feature_map[name] for name in FEATURE_ORDER]


def sigmoid(x):
    if x < -35:
        return 0.0
    if x > 35:
        return 1.0
    return 1.0 / (1.0 + math.exp(-x))


def predict_prob(weights, bias, x):
    z = bias + sum(w * xi for w, xi in zip(weights, x))
    return sigmoid(z)


def train_logreg(X, y, lr=0.08, epochs=450):
    weights = [0.0] * len(X[0])
    bias = 0.0
    n = len(X)
    for _ in range(epochs):
        grad_w = [0.0] * len(weights)
        grad_b = 0.0
        for xi, yi in zip(X, y):
            p = predict_prob(weights, bias, xi)
            err = p - yi
            for j in range(len(weights)):
                grad_w[j] += err * xi[j]
            grad_b += err
        for j in range(len(weights)):
            weights[j] -= lr * (grad_w[j] / n)
        bias -= lr * (grad_b / n)
    return weights, bias


def evaluate(weights, bias, X, y, threshold=0.55):
    tp = fp = tn = fn = 0
    for xi, yi in zip(X, y):
        p = predict_prob(weights, bias, xi)
        pred = 1 if p >= threshold else 0
        if pred == 1 and yi == 1:
            tp += 1
        elif pred == 1 and yi == 0:
            fp += 1
        elif pred == 0 and yi == 0:
            tn += 1
        else:
            fn += 1
    total = max(1, tp + tn + fp + fn)
    precision = tp / max(1, (tp + fp))
    recall = tp / max(1, (tp + fn))
    accuracy = (tp + tn) / total
    f1 = 0.0 if precision + recall == 0 else (2 * precision * recall) / (precision + recall)
    return {
        "accuracy": round(accuracy, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
    }


def find_best_threshold(weights, bias, X, y):
    best_threshold = 0.55
    best_f1 = -1.0
    for i in range(35, 81):
        t = i / 100.0
        metrics = evaluate(weights, bias, X, y, t)
        if metrics["f1"] > best_f1:
            best_f1 = metrics["f1"]
            best_threshold = t
    return best_threshold


def main():
    if not DATA_PATH.exists():
        raise SystemExit(f"missing dataset: {DATA_PATH}")

    rows = [json.loads(line) for line in DATA_PATH.read_text().splitlines() if line.strip()]
    random.seed(42)
    random.shuffle(rows)

    X = [vectorize(featurize(row)) for row in rows]
    y = [int(row["shouldAutoApply"]) for row in rows]

    split_idx = int(len(rows) * 0.8)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    weights, bias = train_logreg(X_train, y_train)
    best_threshold = find_best_threshold(weights, bias, X_test, y_test)
    metrics = evaluate(weights, bias, X_test, y_test, best_threshold)

    model = {
      "version": "router-v1",
      "featureOrder": FEATURE_ORDER,
      "weights": [round(w, 8) for w in weights],
      "bias": round(bias, 8),
      "threshold": best_threshold
    }
    (ARTIFACT_DIR / "router_model.json").write_text(json.dumps(model, indent=2))
    (ARTIFACT_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2))
    print("trained model -> artifacts/router_model.json")
    print("metrics:", metrics)


if __name__ == "__main__":
    main()
