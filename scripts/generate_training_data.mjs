import fs from "node:fs";
import path from "node:path";

const outDir = path.join(process.cwd(), "data", "training");
fs.mkdirSync(outDir, { recursive: true });

const records = [];

async function fetchTavilyTerms() {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return ["onboarding", "sla", "incident", "pipeline", "sso", "compliance"];

  const queries = [
    "enterprise crm account handover terminology",
    "it service slo dependency terminology",
    "business pipeline coverage close rate terminology",
  ];
  const terms = new Set(["onboarding", "sla", "incident", "pipeline", "sso", "compliance"]);
  for (const query of queries) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: key,
          query,
          max_results: 2,
          search_depth: "basic",
        }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const text = (json.results ?? [])
        .map((r) => `${r.title ?? ""} ${r.content ?? ""}`)
        .join(" ")
        .toLowerCase();
      for (const token of text.split(/[^a-z0-9]+/g)) {
        if (token.length >= 5 && token.length <= 14) terms.add(token);
      }
    } catch {
      // ignore and keep defaults
    }
  }
  return [...terms].slice(0, 30);
}

function add(sourceType, content, fact, value, confidence, ambiguityReason, shouldAutoApply) {
  records.push({
    sourceType,
    content,
    fact,
    value,
    confidence,
    ambiguityReason: ambiguityReason ?? "",
    shouldAutoApply,
  });
}

add("crm", "Acme account owner is David Park.", "account_owner", "David Park", 0.96, "", 1);
add("crm", "Account reassigned from Sarah to David during transition.", "account_owner", "David", 0.72, "transition", 0);
add("email", "Maybe Sarah still owns Acme during transition.", "account_owner", "Sarah", 0.62, "maybe", 0);
add("hr", "Priya joined as Security Engineer on 2026-04-10.", "role", "Security Engineer", 0.95, "", 1);
add("ticket", "P1 incident, owner Platform Team", "priority", "P1", 0.97, "", 1);
add("ticket", "Likely root cause in auth layer", "status", "root cause likely auth", 0.58, "likely", 0);
add("policy", "Violations must be escalated within 24 hours", "sla_hours", "24", 0.96, "", 1);
add("policy", "Possibly escalate quickly", "process_step", "escalation_required", 0.52, "possibly", 0);
add("collab", "Blocker is legal sign-off", "risk_note", "legal sign-off", 0.88, "", 0);
add("it", "payments-api depends on redis-cache-eu", "dependency", "redis-cache-eu", 0.93, "", 1);
add("it", "payments-api SLO target may be adjusted", "slo_target", "adjusting", 0.64, "may", 0);
add("business", "pipeline coverage 3.4x target", "pipeline_metric", "3.4x", 0.9, "", 1);
add("business", "risk concentrated in DACH", "risk_note", "DACH", 0.83, "", 0);

const names = ["Sarah Lee", "David Park", "Priya Nair", "Elena Rossi", "Noah Klein", "Marta Silva"];
const accounts = ["Acme Manufacturing", "Orion Logistics", "BluePeak Energy", "Nova Retail"];
const teams = ["Platform Team", "Growth Team", "Security Team", "Infra Team"];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  const terms = await fetchTavilyTerms();
  const expanded = [];

  for (let i = 0; i < 8; i += 1) {
    const owner = randomItem(names);
    const account = randomItem(accounts);
    const nextOwner = randomItem(names.filter((n) => n !== owner));
    const team = randomItem(teams);
    const term = randomItem(terms);

    expanded.push(
      ...records.map((row) => {
        const jitter = (Math.random() - 0.5) * 0.12;
        return {
          ...row,
          confidence: Math.max(0.05, Math.min(0.99, Number((row.confidence + jitter).toFixed(3)))),
        };
      })
    );

    expanded.push(
      {
        sourceType: "crm",
        content: `Account ${account} was reassigned from ${owner} to ${nextOwner} effective May 1. Renewal amount is €${180 + i * 10},000 ARR.`,
        fact: "account_owner",
        value: nextOwner,
        confidence: 0.95,
        ambiguityReason: "",
        shouldAutoApply: 1,
      },
      {
        sourceType: "email",
        content: `Maybe ${owner} still owns ${account} during transition while ${nextOwner} shadows.`,
        fact: "account_owner",
        value: owner,
        confidence: 0.61,
        ambiguityReason: "tentative language",
        shouldAutoApply: 0,
      },
      {
        sourceType: "ticket",
        content: `P1 incident on ${term} subsystem. Owner: ${team}. Mitigation in progress.`,
        fact: "priority",
        value: "P1",
        confidence: 0.94,
        ambiguityReason: "",
        shouldAutoApply: 1,
      },
      {
        sourceType: "it",
        content: `Service ${term}-api depends on postgres-prod-${(i % 3) + 1} and redis-cache-eu. Current SLO target is 99.95%.`,
        fact: "dependency",
        value: `postgres-prod-${(i % 3) + 1}`,
        confidence: 0.92,
        ambiguityReason: "",
        shouldAutoApply: 1,
      },
      {
        sourceType: "business",
        content: `Q2 forecast updated: EMEA pipeline coverage ${(3 + i / 10).toFixed(1)}x target, expected close rate ${24 + i}%, risk concentrated in ${term} segment.`,
        fact: "pipeline_metric",
        value: `${(3 + i / 10).toFixed(1)}x`,
        confidence: 0.9,
        ambiguityReason: "",
        shouldAutoApply: 1,
      },
      {
        sourceType: "collab",
        content: `#q${(i % 4) + 1}-launch blocker is legal sign-off for ${term}.`,
        fact: "risk_note",
        value: "legal sign-off",
        confidence: 0.83,
        ambiguityReason: "",
        shouldAutoApply: 0,
      }
    );
  }

  const shuffled = expanded.sort(() => Math.random() - 0.5);
  const filePath = path.join(outDir, "labeled_candidates.jsonl");
  fs.writeFileSync(filePath, shuffled.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`wrote ${shuffled.length} samples to ${filePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
