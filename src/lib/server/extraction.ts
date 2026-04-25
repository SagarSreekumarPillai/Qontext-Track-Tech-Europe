import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

export const extractedFactSchema = z.object({
  entityType: z.enum(["employee", "customer", "project", "task", "policy", "process"]),
  entityId: z.string().min(1),
  fact: z.string().min(1),
  value: z.string().min(1),
  confidence: z.number().min(0).max(1),
  ambiguityReason: z.string().optional(),
});

export const extractionResponseSchema = z.object({
  facts: z.array(extractedFactSchema),
});

type ExtractedResponse = z.infer<typeof extractionResponseSchema>;

const EMPTY: ExtractedResponse = { facts: [] };

function maybeParseJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return EMPTY;
  return JSON.parse(jsonMatch[0]);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function canonicalFactKey(key: string): string {
  const k = key.toLowerCase().trim();
  if (k.includes("owns") || k.includes("owner") || k.includes("owned_by")) return "account_owner";
  if (k.includes("sla")) return "sla_hours";
  if (k.includes("slo")) return "slo_target";
  if (k.includes("depend")) return "dependency";
  if (k.includes("forecast")) return "forecast_metric";
  if (k.includes("pipeline")) return "pipeline_metric";
  if (k.includes("close")) return "close_rate";
  if (k.includes("risk")) return "risk_note";
  if (k.includes("status")) return "status";
  if (k.includes("priority")) return "priority";
  if (k.includes("ticket")) return "ticket_reference";
  if (k.includes("policy")) return "policy_reference";
  return slugify(k);
}

function looksLikeDateOrTime(value: string): boolean {
  const v = value.trim().toLowerCase();
  return (
    /\b\d{4}-\d{2}-\d{2}\b/.test(v) ||
    /\b\d{1,2}:\d{2}\s?(utc|am|pm)?\b/.test(v) ||
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/.test(v)
  );
}

function normalizeFacts(facts: ExtractedResponse["facts"]): ExtractedResponse["facts"] {
  const normalized = facts
    .map((fact) => ({
      ...fact,
      entityId: slugify(fact.entityId),
      fact: canonicalFactKey(fact.fact),
      value: fact.value.trim(),
      confidence: Math.max(0, Math.min(1, fact.confidence)),
    }))
    .filter((fact) => fact.entityId && fact.fact && fact.value)
    .filter((fact) => !(fact.fact === "name" && slugify(fact.value) === fact.entityId))
    .filter((fact) => !(fact.fact === "account_owner" && looksLikeDateOrTime(fact.value)));

  const bestByTuple = new Map<string, (typeof normalized)[number]>();
  for (const fact of normalized) {
    const tuple = `${fact.entityType}|${fact.entityId}|${fact.fact}|${fact.value.toLowerCase()}`;
    const prev = bestByTuple.get(tuple);
    if (!prev || fact.confidence > prev.confidence) bestByTuple.set(tuple, fact);
  }
  return [...bestByTuple.values()];
}

export async function extractFactsWithGemini(input: {
  sourceType: string;
  sourceId: string;
  content: string;
}): Promise<ExtractedResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL || "gemini-2.5-pro";

  const prompt = `
You are an enterprise memory extraction engine.
Extract only explicit facts from one source record.
Return strict JSON with shape:
{
  "facts": [
    {
      "entityType": "employee|customer|project|task|policy|process",
      "entityId": "lowercase-slug",
      "fact": "fact_key",
      "value": "string",
      "confidence": 0.0,
      "ambiguityReason": "optional"
    }
  ]
}

Input sourceType: ${input.sourceType}
Input sourceId: ${input.sourceId}
Content: """${input.content}"""

Rules:
- No markdown, no prose, JSON only.
- Confidence > 0.9 only if explicit and unambiguous.
- For uncertain ownership wording, confidence should be <= 0.9 and include ambiguityReason.
- Do not output generic "name" facts unless they add business context.
- Prefer canonical business fact keys: account_owner, status, sla_hours, policy_reference, ticket_reference, role, process_step.
- If text contains tentative language ("maybe", "likely", "during transition", "unclear"), still emit the best candidate fact with low confidence and ambiguityReason.
- Never return an empty facts array when a business relation is inferable from the text.
- For IT/service records, prioritize: dependency, slo_target, incident_impact, owner_team.
- For business records, prioritize: forecast_metric, pipeline_metric, close_rate, risk_note.
- Never use dates/times as account_owner values.
`;

  try {
    const runExtraction = async (promptText: string) => {
      const result = await ai.models.generateContent({
        model,
        contents: promptText,
      });
      const text = result.text || "";
      const parsed = maybeParseJson(text);
      const output = extractionResponseSchema.parse(parsed);
      return { facts: normalizeFacts(output.facts) };
    };

    const first = await runExtraction(prompt);
    if (first.facts.length > 0) return first;

    const recoveryPrompt = `
You must extract at least one actionable business fact from this record.
Return strict JSON only: {"facts":[...]} using allowed entityType values.
Prefer concise fact keys and avoid generic labels.
Input sourceType: ${input.sourceType}
Input sourceId: ${input.sourceId}
Content: """${input.content}"""
`;

    const second = await runExtraction(recoveryPrompt);
    return second;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Gemini extraction failed");
  }
}
