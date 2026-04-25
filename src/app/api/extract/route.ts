import { NextResponse } from "next/server";
import { z } from "zod";
import { enrichWithTavily } from "@/lib/server/tavily";
import { extractFactsWithGemini } from "@/lib/server/extraction";
import { extractFactsWithAlternateEngine } from "@/lib/server/alternateExtraction";
import { inferRoute } from "@/lib/server/modelInference";

const requestSchema = z.object({
  sourceType: z.enum(["crm", "email", "hr", "ticket", "policy", "collab", "it", "business"]),
  sourceId: z.string().min(1),
  content: z.string().min(1),
});

export async function POST(request: Request) {
  let parsedBody:
    | {
        sourceType: "crm" | "email" | "hr" | "ticket" | "policy" | "collab" | "it" | "business";
        sourceId: string;
        content: string;
      }
    | undefined;
  try {
    const body = requestSchema.parse(await request.json());
    parsedBody = body;
    let provider: "gemini" | "alternate-engine" = "gemini";
    let extracted = await extractFactsWithGemini(body);
    if (extracted.facts.length === 0) {
      const alternateFacts = extractFactsWithAlternateEngine(body);
      if (alternateFacts.length > 0) {
        extracted = { facts: alternateFacts };
        provider = "alternate-engine";
      }
    }

    const routedFacts = extracted.facts.map((fact) => {
      const decision = inferRoute(body.sourceType, body.content, {
        fact: fact.fact,
        value: fact.value,
        confidence: fact.confidence,
        ambiguityReason: fact.ambiguityReason,
      });
      const adjustedConfidence = decision.shouldAutoApply
        ? Math.max(fact.confidence, decision.probabilityAutoApply)
        : Math.min(fact.confidence, decision.probabilityAutoApply);

      return {
        ...fact,
        confidence: Number(adjustedConfidence.toFixed(3)),
        routingDecision: decision.shouldAutoApply ? "auto_apply" : "review_queue",
        routingScore: Number(decision.probabilityAutoApply.toFixed(3)),
        ambiguityReason:
          !decision.shouldAutoApply && !fact.ambiguityReason
            ? "Routing model flagged ambiguity risk."
            : fact.ambiguityReason,
      };
    });

    const topFact = routedFacts[0];
    const factKey = topFact?.fact.toLowerCase() ?? "";
    const ownershipLike =
      factKey.includes("owner") || factKey.includes("owns") || factKey.includes("ownership");

    const shouldEnrich =
      Boolean(topFact) &&
      topFact.confidence >= 0.9 &&
      body.sourceType !== "email" &&
      !topFact.ambiguityReason &&
      !ownershipLike &&
      !factKey.includes("name");

    const enrichment = shouldEnrich
      ? await enrichWithTavily(`${topFact.entityId} ${topFact.fact} ${topFact.value}`)
      : { verified: false };

    return NextResponse.json({
      ok: true,
      facts: routedFacts,
      enrichment,
      provider,
      routing_model: "enabled",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraction failed";
    const isQuota = message.includes("RESOURCE_EXHAUSTED") || message.includes("\"code\":429");
    if (isQuota && parsedBody) {
      const fallbackBody = parsedBody;
      try {
        const alternateFacts = extractFactsWithAlternateEngine(fallbackBody);
        const routedFacts = alternateFacts.map((fact) => {
          const decision = inferRoute(fallbackBody.sourceType, fallbackBody.content, {
            fact: fact.fact,
            value: fact.value,
            confidence: fact.confidence,
            ambiguityReason: fact.ambiguityReason,
          });
          const adjustedConfidence = decision.shouldAutoApply
            ? Math.max(fact.confidence, decision.probabilityAutoApply)
            : Math.min(fact.confidence, decision.probabilityAutoApply);

          return {
            ...fact,
            confidence: Number(adjustedConfidence.toFixed(3)),
            routingDecision: decision.shouldAutoApply ? "auto_apply" : "review_queue",
            routingScore: Number(decision.probabilityAutoApply.toFixed(3)),
            ambiguityReason:
              !decision.shouldAutoApply && !fact.ambiguityReason
                ? "Routing model flagged ambiguity risk."
                : fact.ambiguityReason,
          };
        });
        return NextResponse.json({
          ok: true,
          facts: routedFacts,
          enrichment: { verified: false },
          provider: "alternate-engine",
          degraded_mode: "gemini_quota_exhausted",
          routing_model: "enabled",
        });
      } catch {
        // fall through to explicit error below
      }
    }
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: isQuota ? 429 : 400 }
    );
  }
}
