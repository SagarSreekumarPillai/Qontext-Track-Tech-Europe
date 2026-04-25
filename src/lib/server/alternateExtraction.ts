import { z } from "zod";

const sourceTypeSchema = z.enum(["crm", "email", "hr", "ticket", "policy", "collab", "it", "business"]);

export type AlternateExtractionInput = {
  sourceType: z.infer<typeof sourceTypeSchema>;
  sourceId: string;
  content: string;
};

export type AlternateFact = {
  entityType: "employee" | "customer" | "project" | "task" | "policy" | "process";
  entityId: string;
  fact: string;
  value: string;
  confidence: number;
  ambiguityReason?: string;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pickAccountName(text: string): string | null {
  const patterns = [
    /account\s+([a-zA-Z0-9][a-zA-Z0-9\s-]{1,40}?)(?:\s+(was|is|has|to|from|effective)\b|[.,;]|$)/i,
    /customer\s+([a-zA-Z0-9][a-zA-Z0-9\s-]{1,40}?)(?:\s+(was|is|has|to|from|effective)\b|[.,;]|$)/i,
    /for\s+([a-zA-Z0-9][a-zA-Z0-9\s-]{1,40})\s+(account|customer)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function extractPeople(text: string): string[] {
  const matches = [...text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g)];
  return [...new Set(matches.map((m) => m[1].trim()))];
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, value));
}

function parseStructuredPairs(content: string): Array<{ key: string; value: string }> {
  return content
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const parts = chunk.split(/\s+/);
      if (parts.length < 2) return null;
      const key = parts[0].toLowerCase().replace(/[^a-z0-9_]+/g, "_");
      const value = parts.slice(1).join(" ").trim();
      if (!key || !value) return null;
      return { key, value };
    })
    .filter((x): x is { key: string; value: string } => Boolean(x));
}

function getPairValue(pairs: Array<{ key: string; value: string }>, keys: string[]): string | null {
  for (const target of keys) {
    const hit = pairs.find((p) => p.key === target);
    if (hit) return hit.value;
  }
  return null;
}

function structuredFallbackFacts(input: AlternateExtractionInput): AlternateFact[] {
  const pairs = parseStructuredPairs(input.content);
  if (pairs.length === 0) return [];

  let entityType: AlternateFact["entityType"] = "project";
  if (input.sourceType === "hr") entityType = "employee";
  else if (input.sourceType === "crm" || input.sourceType === "business") entityType = "customer";
  else if (input.sourceType === "ticket" || input.sourceType === "email") entityType = "task";
  else if (input.sourceType === "policy") entityType = "policy";
  else if (input.sourceType === "it") entityType = "process";

  const entityId =
    slugify(
      getPairValue(pairs, [
        "client_id",
        "customer_id",
        "product_id",
        "emp_id",
        "business_name",
        "name",
        "issue_key",
      ]) || input.sourceId
    ) || slugify(input.sourceId);

  const keyMap: Record<string, string> = {
    business_name: "status",
    customer_name: "status",
    industry: "industry",
    business_type: "business_type",
    monthly_revenue: "forecast_metric",
    poc_status: "status",
    relationship_description: "risk_note",
    category: "role",
    name: "status",
    author: "account_owner",
    title: "status",
    post: "status",
    level: "status",
    performance_rating: "priority",
    salary: "forecast_metric",
    description: "status",
    review_content: "status",
    subject: "status",
    product_id: "status",
    discounted_price: "forecast_metric",
    actual_price: "forecast_metric",
    discount_percentage: "forecast_metric",
    date_of_purchase: "status",
    issues_title: "risk_note",
    repo_name: "status",
    language: "status",
    priority: "priority",
    status: "status",
    importance: "priority",
  };

  const facts: AlternateFact[] = [];
  for (const pair of pairs) {
    const fact = keyMap[pair.key];
    if (!fact) continue;
    facts.push({
      entityType,
      entityId,
      fact,
      value: pair.value,
      confidence: 0.74,
      ambiguityReason: "Derived from structured key-value export row.",
    });
  }
  return facts.slice(0, 5);
}

function fromCrm(content: string): AlternateFact[] {
  const facts: AlternateFact[] = [];
  const lc = content.toLowerCase();
  const account = pickAccountName(content) ?? "unknown-account";
  const explicitOwnerChange = /account\s+owner\s+changed\s+to\s+/i.test(content);

  const reassigned = content.match(/reassigned\s+from\s+([A-Za-z]+\s*[A-Za-z]*)\s+to\s+([A-Za-z]+\s*[A-Za-z]*)/i);
  if (reassigned) {
    facts.push({
      entityType: "customer",
      entityId: slugify(account),
      fact: "account_owner",
      value: reassigned[2].trim(),
      confidence: 0.96,
      ambiguityReason: "Owner transition detected from CRM reassignment event.",
    });
  }
  const reassignedTo = content.match(/reassigned\s+to\s+([A-Za-z]+(?:\s+[A-Za-z]+){0,2})/i);
  if (reassignedTo) {
    facts.push({
      entityType: "customer",
      entityId: slugify(account),
      fact: "account_owner",
      value: reassignedTo[1].trim(),
      confidence: 0.9,
      ambiguityReason: "Owner inferred from reassignment target.",
    });
  }

  const owns = explicitOwnerChange
    ? null
    : content.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(owns|owner(?:\s+of)?)\s+([A-Za-z0-9][A-Za-z0-9\s-]{1,40})/);
  if (owns) {
    facts.push({
      entityType: "customer",
      entityId: slugify(owns[3]),
      fact: "account_owner",
      value: owns[1].trim(),
      confidence: lc.includes("maybe") ? 0.62 : 0.94,
      ambiguityReason: lc.includes("maybe") ? "Tentative language detected in ownership statement." : undefined,
    });
  }

  const ownerField = explicitOwnerChange
    ? null
    : content.match(/owner[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/);
  if (ownerField) {
    const ownerVal = ownerField[1].trim();
    if (!/^(changed|from|to|account)$/i.test(ownerVal)) {
    facts.push({
      entityType: "customer",
      entityId: slugify(account),
      fact: "account_owner",
      value: ownerVal,
      confidence: 0.92,
    });
    }
  }
  const ownerChanged = content.match(/owner\s+changed\s+to\s+([A-Za-z]+(?:\s+[A-Za-z]+){0,2})/i);
  if (ownerChanged) {
    facts.push({
      entityType: "customer",
      entityId: slugify(account),
      fact: "account_owner",
      value: ownerChanged[1].trim(),
      confidence: 0.89,
      ambiguityReason: "Owner change inferred from change statement.",
    });
  }

  const stageField = content.match(/stage\s+([A-Za-z][A-Za-z\s-]{1,30})/i);
  if (stageField) {
    facts.push({
      entityType: "customer",
      entityId: slugify(account),
      fact: "status",
      value: stageField[1].trim(),
      confidence: 0.87,
    });
  }

  const arr = content.match(/(€|\$)\s?([0-9][0-9,\.]*)\s*(arr|acv|mrr)?/i);
  if (arr) {
    facts.push({
      entityType: "customer",
      entityId: slugify(account),
      fact: "forecast_metric",
      value: `${arr[1]}${arr[2]}${arr[3] ? ` ${arr[3].toUpperCase()}` : ""}`,
      confidence: 0.91,
    });
  }
  const amountPlain = content.match(/amount\s+is?\s*([0-9][0-9,\.]*)/i) || content.match(/amount\s*([0-9][0-9,\.]*)/i);
  if (amountPlain) {
    facts.push({
      entityType: "customer",
      entityId: slugify(account),
      fact: "forecast_metric",
      value: amountPlain[1],
      confidence: 0.86,
    });
  }

  return facts;
}

function fromEmail(content: string): AlternateFact[] {
  const lc = content.toLowerCase();
  const cleaned = content
    .replace(/\b(maybe|likely|possibly|perhaps)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const people = extractPeople(cleaned);
  const account = pickAccountName(content) ?? (lc.includes("acme") ? "acme" : "unknown-account");
  const owner = people[0];
  if (!owner) return [];
  return [
    {
      entityType: "customer",
      entityId: slugify(account),
      fact: "account_owner",
      value: owner,
      confidence: lc.includes("maybe") || lc.includes("likely") ? 0.6 : 0.86,
      ambiguityReason:
        lc.includes("maybe") || lc.includes("likely")
          ? "Tentative ownership language in email source."
          : undefined,
    },
  ];
}

function fromHr(content: string): AlternateFact[] {
  const facts: AlternateFact[] = [];
  const joined = content.match(/([A-Za-z]+\s+[A-Za-z]+)\s+joined\s+as\s+(.+?)\s+in\s+([A-Za-z]+)\s+on\s+(\d{4}-\d{2}-\d{2})/i);
  if (joined) {
    facts.push({
      entityType: "employee",
      entityId: slugify(joined[1]),
      fact: "role",
      value: joined[2].trim(),
      confidence: 0.97,
    });
    facts.push({
      entityType: "employee",
      entityId: slugify(joined[1]),
      fact: "start_date",
      value: joined[4],
      confidence: 0.97,
    });
    facts.push({
      entityType: "employee",
      entityId: slugify(joined[1]),
      fact: "location",
      value: joined[3],
      confidence: 0.93,
    });
  }
  const joinedSimple = content.match(/([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+joined\s+as\s+(.+?)\s+on\s+(\d{4}-\d{2}-\d{2})/i);
  if (joinedSimple) {
    facts.push({
      entityType: "employee",
      entityId: slugify(joinedSimple[1]),
      fact: "role",
      value: joinedSimple[2].trim(),
      confidence: 0.95,
    });
    facts.push({
      entityType: "employee",
      entityId: slugify(joinedSimple[1]),
      fact: "start_date",
      value: joinedSimple[3],
      confidence: 0.95,
    });
  }
  const reports = content.match(/reports?\s+to\s+([A-Za-z]+\s+[A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
  if (reports && joined) {
    const manager = reports[1].replace(/^(cto|ceo|cfo|coo)\s+/i, "").trim();
    facts.push({
      entityType: "employee",
      entityId: slugify(joined[1]),
      fact: "reports_to",
      value: manager,
      confidence: 0.95,
    });
  }
  return facts;
}

function fromTicket(content: string, sourceId: string): AlternateFact[] {
  const facts: AlternateFact[] = [];
  const priority = content.match(/\b(P[0-3])\b/i);
  if (priority) {
    facts.push({
      entityType: "task",
      entityId: slugify(sourceId),
      fact: "priority",
      value: priority[1].toUpperCase(),
      confidence: 0.98,
    });
  }
  const textualPriority = content.match(/priority[:\s]+(low|medium|high|urgent|highest)/i);
  if (textualPriority) {
    facts.push({
      entityType: "task",
      entityId: slugify(sourceId),
      fact: "priority",
      value: textualPriority[1].toUpperCase(),
      confidence: 0.9,
    });
  }
  const owner = content.match(/owner[:\s]+([A-Za-z][A-Za-z\s-]{1,40})/i);
  if (owner) {
    facts.push({
      entityType: "task",
      entityId: slugify(sourceId),
      fact: "account_owner",
      value: owner[1].trim(),
      confidence: 0.9,
    });
  }
  const assignee = content.match(/assignee[:\s]+([A-Za-z][A-Za-z\s-]{1,40})/i);
  if (assignee) {
    facts.push({
      entityType: "task",
      entityId: slugify(sourceId),
      fact: "account_owner",
      value: assignee[1].trim(),
      confidence: 0.86,
    });
  }
  const statusField = content.match(/status[:\s]+([A-Za-z][A-Za-z\s-]{1,40})/i);
  if (statusField) {
    facts.push({
      entityType: "task",
      entityId: slugify(sourceId),
      fact: "status",
      value: statusField[1].trim(),
      confidence: 0.89,
    });
  }
  const impact = content.match(/(incident|outage|failure[s]?)[\s:.-]+(.+?)(\.|$)/i);
  if (impact) {
    facts.push({
      entityType: "task",
      entityId: slugify(sourceId),
      fact: "status",
      value: impact[2].trim(),
      confidence: 0.88,
    });
  }
  const rootCause = content.match(/(likely\s+)?root cause\s+in\s+(.+?)(\.|$)/i);
  if (rootCause) {
    facts.push({
      entityType: "task",
      entityId: slugify(sourceId),
      fact: "status",
      value: `root cause ${rootCause[2].trim()}`,
      confidence: rootCause[1] ? 0.62 : 0.82,
      ambiguityReason: rootCause[1] ? "Root cause marked as likely, not confirmed." : undefined,
    });
  }
  return facts;
}

function fromPolicy(content: string, sourceId: string): AlternateFact[] {
  const facts: AlternateFact[] = [];
  const hours = content.match(/within\s+(\d+)\s+hours?/i);
  if (hours) {
    facts.push({
      entityType: "policy",
      entityId: slugify(sourceId),
      fact: "sla_hours",
      value: hours[1],
      confidence: 0.97,
    });
  }
  const mfa = /requires?\s+mfa/i.test(content);
  if (mfa) {
    facts.push({
      entityType: "policy",
      entityId: slugify(sourceId),
      fact: "policy_reference",
      value: "mfa_required",
      confidence: 0.95,
    });
  }
  if (/possibly|likely|maybe/i.test(content) && !hours) {
    facts.push({
      entityType: "policy",
      entityId: slugify(sourceId),
      fact: "process_step",
      value: "escalation_required",
      confidence: 0.55,
      ambiguityReason: "Policy statement is tentative.",
    });
  }
  return facts;
}

function fromCollab(content: string): AlternateFact[] {
  const facts: AlternateFact[] = [];
  const project = content.match(/#([a-z0-9-]+)/i);
  const date = content.match(/(?:to|on|by)\s+(\d{1,2}\s+[A-Za-z]{3,9})/i);
  if (project && date) {
    facts.push({
      entityType: "project",
      entityId: slugify(project[1]),
      fact: "status",
      value: `milestone ${date[1]}`,
      confidence: 0.9,
    });
  }
  const blocker = content.match(/blocker\s+(?:is|:)\s+(.+?)(\.|$)/i);
  if (project && blocker) {
    facts.push({
      entityType: "project",
      entityId: slugify(project[1]),
      fact: "risk_note",
      value: blocker[1].trim(),
      confidence: 0.88,
    });
  }
  if (!project && blocker) {
    facts.push({
      entityType: "project",
      entityId: "general-collab",
      fact: "risk_note",
      value: blocker[1].trim(),
      confidence: 0.82,
    });
  }
  const ownsTask = content.match(/([A-Za-z][A-Za-z\s-]{1,30})\s+owns\s+(.+?)(?:\.|$)/i);
  if (ownsTask) {
    facts.push({
      entityType: "task",
      entityId: slugify(ownsTask[2]),
      fact: "account_owner",
      value: ownsTask[1].trim(),
      confidence: 0.85,
    });
  }
  const lc = content.toLowerCase();
  if (!project && !blocker && !ownsTask) {
    if (lc.includes("project timeline") || lc.includes("product launch") || lc.includes("milestone")) {
      facts.push({
        entityType: "project",
        entityId: "general-collab",
        fact: "status",
        value: "timeline coordination discussion",
        confidence: 0.72,
        ambiguityReason: "Derived from collaboration transcript context.",
      });
    }
    if (lc.includes("vendor management") || lc.includes("delay") || lc.includes("bottleneck")) {
      facts.push({
        entityType: "project",
        entityId: "general-collab",
        fact: "risk_note",
        value: "vendor-related delays",
        confidence: 0.7,
        ambiguityReason: "Derived from collaboration transcript risk cues.",
      });
    }
  }
  return facts;
}

function fromIt(content: string): AlternateFact[] {
  const facts: AlternateFact[] = [];
  const service = content.match(/service\s+([a-z0-9-]+)/i) || content.match(/\b([a-z0-9-]+)\s+depends\s+on\b/i);
  if (!service) return facts;
  const serviceId = slugify(service[1]);

  const deps = [...content.matchAll(/\b([a-z]+-[a-z0-9-]+)\b/gi)]
    .map((m) => m[1])
    .filter((d) => d !== service[1]);
  for (const dep of [...new Set(deps)].slice(0, 3)) {
    facts.push({
      entityType: "process",
      entityId: serviceId,
      fact: "dependency",
      value: dep,
      confidence: 0.9,
    });
  }

  const slo = content.match(/slo\s+target\s+is\s+([0-9.]+%)/i);
  if (slo) {
    facts.push({
      entityType: "process",
      entityId: serviceId,
      fact: "slo_target",
      value: slo[1],
      confidence: 0.96,
    });
  }
  const sloTentative = content.match(/slo\s+target\s+may\s+be\s+adjusted/i);
  if (sloTentative) {
    facts.push({
      entityType: "process",
      entityId: serviceId,
      fact: "slo_target",
      value: "adjusting",
      confidence: 0.6,
      ambiguityReason: "SLO target marked as tentative.",
    });
  }
  return facts;
}

function fromBusiness(content: string, sourceId: string): AlternateFact[] {
  const facts: AlternateFact[] = [];
  const pipeline = content.match(/pipeline\s+coverage\s+([0-9.]+x)/i);
  if (pipeline) {
    facts.push({
      entityType: "project",
      entityId: slugify(sourceId),
      fact: "pipeline_metric",
      value: pipeline[1],
      confidence: 0.92,
    });
  }
  const closeRate = content.match(/close\s+rate\s+([0-9.]+%)/i);
  if (closeRate) {
    facts.push({
      entityType: "project",
      entityId: slugify(sourceId),
      fact: "close_rate",
      value: closeRate[1],
      confidence: 0.91,
    });
  }
  const risk = content.match(/risk\s+(?:concentrated\s+in|in)\s+(.+?)(\.|,|$)/i);
  if (risk) {
    facts.push({
      entityType: "project",
      entityId: slugify(sourceId),
      fact: "risk_note",
      value: risk[1].trim(),
      confidence: 0.88,
    });
  }
  return facts;
}

export function extractFactsWithAlternateEngine(input: AlternateExtractionInput): AlternateFact[] {
  const normalizedInput = {
    ...input,
    sourceType: sourceTypeSchema.parse(input.sourceType),
  };
  let facts: AlternateFact[] = [];
  switch (normalizedInput.sourceType) {
    case "crm":
      facts = fromCrm(normalizedInput.content);
      break;
    case "email":
      facts = fromEmail(normalizedInput.content);
      break;
    case "hr":
      facts = fromHr(normalizedInput.content);
      break;
    case "ticket":
      facts = fromTicket(normalizedInput.content, normalizedInput.sourceId);
      break;
    case "policy":
      facts = fromPolicy(normalizedInput.content, normalizedInput.sourceId);
      break;
    case "collab":
      facts = fromCollab(normalizedInput.content);
      break;
    case "it":
      facts = fromIt(normalizedInput.content);
      break;
    case "business":
      facts = fromBusiness(normalizedInput.content, normalizedInput.sourceId);
      break;
    default:
      facts = [];
  }

  if (facts.length === 0) {
    facts = structuredFallbackFacts(normalizedInput);
  }

  const deduped = new Map<string, AlternateFact>();
  for (const fact of facts) {
    const key = `${fact.entityType}|${fact.entityId}|${fact.fact}|${fact.value.toLowerCase()}`;
    const prev = deduped.get(key);
    if (!prev || fact.confidence > prev.confidence) {
      deduped.set(key, { ...fact, confidence: clampConfidence(fact.confidence) });
    }
  }
  return [...deduped.values()];
}
