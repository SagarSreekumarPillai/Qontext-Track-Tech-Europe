import fs from "node:fs";
import path from "node:path";

type SourceType = "crm" | "email" | "hr" | "ticket" | "policy" | "collab" | "it" | "business";

type RouterModel = {
  version: string;
  featureOrder: string[];
  weights: number[];
  bias: number;
  threshold?: number;
};

type FactForRouting = {
  fact: string;
  value: string;
  confidence: number;
  ambiguityReason?: string;
};

type RouteDecision = {
  shouldAutoApply: boolean;
  probabilityAutoApply: number;
};

let cachedModel: RouterModel | null = null;
let modelLoaded = false;

function modelPath() {
  return path.join(process.cwd(), "artifacts", "router_model.json");
}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function normalize(text: string) {
  return text.toLowerCase();
}

function buildFeatureMap(sourceType: SourceType, content: string, fact: FactForRouting): Record<string, number> {
  const lc = normalize(content);
  const factKey = normalize(fact.fact);
  const val = normalize(fact.value);
  return {
    bias: 1,
    confidence: Math.max(0, Math.min(1, fact.confidence)),
    has_ambiguity_reason: fact.ambiguityReason ? 1 : 0,
    source_email: sourceType === "email" ? 1 : 0,
    source_ticket: sourceType === "ticket" ? 1 : 0,
    source_hr: sourceType === "hr" ? 1 : 0,
    source_it: sourceType === "it" ? 1 : 0,
    source_business: sourceType === "business" ? 1 : 0,
    contains_maybe: lc.includes("maybe") ? 1 : 0,
    contains_transition: lc.includes("transition") ? 1 : 0,
    contains_likely: lc.includes("likely") ? 1 : 0,
    contains_incident: lc.includes("incident") ? 1 : 0,
    contains_blocker: lc.includes("blocker") ? 1 : 0,
    contains_risk: lc.includes("risk") ? 1 : 0,
    fact_is_owner: factKey.includes("owner") || factKey.includes("owns") ? 1 : 0,
    fact_is_sla_or_slo: factKey.includes("sla") || factKey.includes("slo") ? 1 : 0,
    fact_is_dependency: factKey.includes("dependency") ? 1 : 0,
    value_has_percent: val.includes("%") ? 1 : 0,
    value_has_currency: /[$€]/.test(fact.value) ? 1 : 0,
    value_has_date_like: /\d{4}-\d{2}-\d{2}/.test(fact.value) ? 1 : 0,
  };
}

export function loadRouterModel(): RouterModel | null {
  if (modelLoaded) return cachedModel;
  modelLoaded = true;
  try {
    if (!fs.existsSync(modelPath())) return null;
    const raw = fs.readFileSync(modelPath(), "utf-8");
    const parsed = JSON.parse(raw) as RouterModel;
    if (!parsed.featureOrder || !parsed.weights) return null;
    cachedModel = parsed;
    return cachedModel;
  } catch {
    return null;
  }
}

export function inferRoute(sourceType: SourceType, content: string, fact: FactForRouting): RouteDecision {
  const model = loadRouterModel();
  if (!model) {
    const conservativeAuto = fact.confidence > 0.9 && !fact.ambiguityReason;
    return {
      shouldAutoApply: conservativeAuto,
      probabilityAutoApply: conservativeAuto ? 0.85 : 0.25,
    };
  }

  const features = buildFeatureMap(sourceType, content, fact);
  let score = model.bias;
  for (let i = 0; i < model.featureOrder.length; i += 1) {
    const key = model.featureOrder[i];
    const value = features[key] ?? 0;
    score += value * model.weights[i];
  }
  const probabilityAutoApply = sigmoid(score);
  const threshold = model.threshold ?? 0.55;
  return {
    shouldAutoApply: probabilityAutoApply >= threshold,
    probabilityAutoApply,
  };
}
