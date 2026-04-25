import fs from "node:fs";
import path from "node:path";

const datasetPath = path.join(process.cwd(), "data", "training", "labeled_candidates.jsonl");

function parseLines() {
  if (!fs.existsSync(datasetPath)) return [];
  return fs
    .readFileSync(datasetPath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function normalize(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function main() {
  const rows = parseLines().slice(0, 100);
  if (!rows.length) {
    console.log("No dataset rows found. Run npm run data:generate first.");
    process.exit(1);
  }

  let total = 0;
  let hitFact = 0;
  let hitRoute = 0;
  let providerAlt = 0;

  for (const row of rows) {
    const payload = {
      sourceType: row.sourceType,
      sourceId: `BM-${total + 1}`,
      content: row.content,
    };
    const res = await fetch("http://localhost:3000/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) continue;
    const json = await res.json();
    total += 1;
    if (json.provider === "alternate-engine") providerAlt += 1;

    const found = (json.facts ?? []).some((fact) => normalize(fact.fact) === normalize(row.fact));
    if (found) hitFact += 1;

    const expectedRoute = row.shouldAutoApply ? "auto_apply" : "review_queue";
    const routeMatch = (json.facts ?? []).some(
      (fact) =>
        normalize(fact.fact) === normalize(row.fact) && normalize(fact.routingDecision) === normalize(expectedRoute)
    );
    if (routeMatch) hitRoute += 1;
  }

  const metrics = {
    tested_records: total,
    fact_key_hit_rate: Number((hitFact / Math.max(1, total)).toFixed(3)),
    routing_match_rate: Number((hitRoute / Math.max(1, total)).toFixed(3)),
    alternate_provider_rate: Number((providerAlt / Math.max(1, total)).toFixed(3)),
  };
  const outPath = path.join(process.cwd(), "artifacts", "benchmark_metrics.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
