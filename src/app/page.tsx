"use client";

import { useMemo, useState } from "react";
import {
  applyExtractedFacts,
  markFactVerification,
  applyReviewDecision,
  DEMO_UPDATES,
  deriveFileGroups,
  INITIAL_STATE,
  type ExtractedFact,
  type Fact,
  type QontextState,
  type RawRecord,
  type SourceType,
} from "@/lib/qontext";

function confidenceTone(confidence: number) {
  if (confidence > 0.9) return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  if (confidence > 0.75) return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  return "bg-rose-500/20 text-rose-300 border-rose-500/40";
}

function formatTimestamp(timestamp: string) {
  const iso = new Date(timestamp).toISOString();
  return iso.replace("T", " ").replace("Z", " UTC");
}

export default function Home() {
  const [state, setState] = useState<QontextState>(INITIAL_STATE);
  const [selectedPath, setSelectedPath] = useState("/customers/acme.md");
  const [selectedFactId, setSelectedFactId] = useState("f_owner");
  const [demoStep, setDemoStep] = useState(0);
  const [integrationStatus, setIntegrationStatus] = useState("Provider: local fallback");
  const [inputSourceType, setInputSourceType] = useState<SourceType>("crm");
  const [inputSourceId, setInputSourceId] = useState("JUDGE-001");
  const [inputContent, setInputContent] = useState("");
  const [bulkPayload, setBulkPayload] = useState("");
  const [ingestMessage, setIngestMessage] = useState("");

  const selectedEntity = useMemo(
    () => Object.values(state.entities).find((entity) => entity.filePath === selectedPath),
    [selectedPath, state.entities]
  );

  const selectedFact = useMemo(
    () => selectedEntity?.facts.find((fact) => fact.id === selectedFactId) ?? selectedEntity?.facts[0],
    [selectedEntity, selectedFactId]
  );

  const pendingReviews = useMemo(
    () => state.reviewQueue.filter((item) => item.status === "pending"),
    [state.reviewQueue]
  );

  const dynamicFileGroups = useMemo(() => deriveFileGroups(state), [state]);

  const challengeInsights = useMemo(() => {
    const allFacts = Object.values(state.entities).flatMap((entity) => entity.facts);
    const provenanceFacts = allFacts.filter((fact) => fact.sourceType && fact.sourceId).length;
    const autoApplied = state.updateHistory.filter((item) => item.action === "auto_applied").length;
    const queued = state.updateHistory.filter((item) => item.action === "queued").length;
    const humanResolved = state.updateHistory.filter(
      (item) => item.action === "approved" || item.action === "rejected"
    ).length;
    const uniqueSources = new Set(state.rawRecords.map((record) => record.sourceType)).size;
    const highConfidenceFacts = allFacts.filter((fact) => fact.confidence > 0.9).length;

    return {
      totalFacts: allFacts.length,
      provenanceCoverage: allFacts.length ? Math.round((provenanceFacts / allFacts.length) * 100) : 0,
      automationRate: autoApplied + queued ? Math.round((autoApplied / (autoApplied + queued)) * 100) : 100,
      humanResolutionRate: queued ? Math.round((humanResolved / queued) * 100) : 100,
      uniqueSources,
      highConfidenceRate: allFacts.length ? Math.round((highConfidenceFacts / allFacts.length) * 100) : 0,
    };
  }, [state.entities, state.rawRecords, state.updateHistory]);

  const processIncomingRecord = async (record: RawRecord) => {
    let verification: { verified: boolean; sourceUrl?: string } | undefined;
    let provider = "fallback";
    let extractedFacts: ExtractedFact[] = [];

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });
      if (res.ok) {
        const json = await res.json();
        provider = json.provider ?? "fallback";
        extractedFacts = Array.isArray(json.facts) ? json.facts : [];
        verification = {
          verified: Boolean(json.enrichment?.verified),
          sourceUrl: json.enrichment?.sourceUrl,
        };
      }
    } catch {
      provider = "fallback";
    }

    setIntegrationStatus(`Provider: ${provider}${verification?.verified ? " • Tavily verified" : ""}`);

    setState((prev) => {
      const next = applyExtractedFacts(prev, record, extractedFacts);
      const primary = extractedFacts[0];
      if (!primary || !verification) return next;
      return markFactVerification(
        next,
        `${primary.entityType}:${String(primary.entityId).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        String(primary.fact).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        verification
      );
    });

    try {
      await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record,
          action: extractedFacts.some((fact) => fact.confidence <= 0.9) ? "queued" : "auto_applied",
          factKey: extractedFacts[0]?.fact ?? "unknown_fact",
          oldValue: "",
          newValue: extractedFacts[0]?.value ?? "",
        }),
      });
    } catch {
      // Keep flow alive when persistence is unavailable.
    }
  };

  const runNextDemoStep = async () => {
    if (demoStep === 0) {
      setSelectedPath("/customers/acme.md");
      setSelectedFactId("f_owner");
      setDemoStep(1);
      return;
    }

    if (demoStep === 1) {
      await processIncomingRecord(DEMO_UPDATES[0]);
      setSelectedPath("/customers/acme.md");
      setSelectedFactId("f_owner");
      setDemoStep(2);
      return;
    }
    if (demoStep === 2) {
      await processIncomingRecord(DEMO_UPDATES[1]);
      setDemoStep(3);
      return;
    }
    if (demoStep === 3) {
      const firstPending = pendingReviews[0];
      if (firstPending) {
        setState((prev) => applyReviewDecision(prev, firstPending.id, "approved"));
      }
      setDemoStep(4);
    }
  };

  const ingestSingleRecord = async () => {
    if (!inputContent.trim()) {
      setIngestMessage("Provide record content before ingestion.");
      return;
    }
    const record: RawRecord = {
      id: `judge-${Date.now()}`,
      sourceType: inputSourceType,
      sourceId: inputSourceId.trim() || `SRC-${Date.now()}`,
      content: inputContent.trim(),
      timestamp: new Date().toISOString(),
    };
    await processIncomingRecord(record);
    setInputContent("");
    setIngestMessage(`Ingested ${record.sourceType.toUpperCase()} ${record.sourceId}`);
  };

  const parseCsvToRecords = (csv: string): RawRecord[] => {
    const lines = csv.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const index = (name: string) => headers.indexOf(name);
    return lines.slice(1).map((line, idx) => {
      const cols = line.split(",").map((c) => c.trim());
      const sourceType = (cols[index("sourcetype")] || "crm") as SourceType;
      const sourceId = cols[index("sourceid")] || `CSV-${idx + 1}`;
      const content = cols[index("content")] || "";
      const timestamp = cols[index("timestamp")] || new Date().toISOString();
      return { id: `csv-${Date.now()}-${idx}`, sourceType, sourceId, content, timestamp };
    });
  };

  const ingestBulkPayload = async () => {
    const payload = bulkPayload.trim();
    if (!payload) {
      setIngestMessage("Paste JSON array or CSV payload first.");
      return;
    }
    let records: RawRecord[] = [];
    try {
      const parsed = JSON.parse(payload);
      if (Array.isArray(parsed)) {
        records = parsed.map((item, idx) => ({
          id: String(item.id ?? `json-${Date.now()}-${idx}`),
          sourceType: (item.sourceType ?? "crm") as SourceType,
          sourceId: String(item.sourceId ?? `JSON-${idx + 1}`),
          content: String(item.content ?? ""),
          timestamp: String(item.timestamp ?? new Date().toISOString()),
        }));
      }
    } catch {
      records = parseCsvToRecords(payload);
    }

    if (!records.length) {
      setIngestMessage("Could not parse payload. Expected JSON array or CSV with sourceType,sourceId,content,timestamp.");
      return;
    }

    for (const record of records) {
      if (record.content) {
        await processIncomingRecord(record);
      }
    }
    setIngestMessage(`Ingested ${records.length} records from judge dataset payload.`);
  };

  const handleDatasetFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    setBulkPayload(text);
    setIngestMessage(`Loaded ${file.name}. Click "Ingest Dataset Payload".`);
  };

  return (
    <main className="min-h-screen bg-[#090d17] text-slate-100">
      <header className="border-b border-slate-700/60 bg-[#0c1220] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">Qontext Hackathon MVP</p>
            <h1 className="text-2xl font-semibold text-white">LoomOS by Qontext</h1>
            <p className="text-sm text-slate-300">
              Structured enterprise memory with provenance-backed automation and human governance.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Problem: fragmented operational truth across siloed systems. Solution: inspectable memory files + graph,
              with automatic updates for clear facts and human review for ambiguity.
            </p>
            <p className="text-xs text-cyan-200">{integrationStatus}</p>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2 px-3 pt-3 md:grid-cols-3 xl:grid-cols-6">
        <InsightCard label="Fragmented Sources" value={`${challengeInsights.uniqueSources}/5`} />
        <InsightCard label="Memory Facts" value={String(challengeInsights.totalFacts)} />
        <InsightCard label="Provenance Coverage" value={`${challengeInsights.provenanceCoverage}%`} />
        <InsightCard label="Automation Rate" value={`${challengeInsights.automationRate}%`} />
        <InsightCard label="Human Resolution" value={`${challengeInsights.humanResolutionRate}%`} />
        <InsightCard label="High-Confidence Facts" value={`${challengeInsights.highConfidenceRate}%`} />
      </section>

      <section className="grid min-h-[calc(100vh-92px)] grid-cols-1 gap-3 p-3 xl:grid-cols-[280px_1fr_380px]">
        <aside className="rounded-lg border border-slate-700/80 bg-[#0d1425] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-300">Virtual File System</h2>
          <div className="mt-4 space-y-3 text-sm">
            {Object.entries(dynamicFileGroups).map(([folder, files]) => (
              <div key={folder}>
                <p className="font-medium text-slate-300">{folder}</p>
                <div className="mt-1 space-y-1 pl-3">
                  {files.length === 0 ? (
                    <p className="text-xs text-slate-500">No files yet</p>
                  ) : (
                    files.map((filePath) => (
                      <button
                        key={filePath}
                        onClick={() => {
                          setSelectedPath(filePath);
                          setSelectedFactId("");
                        }}
                        className={`block w-full rounded px-2 py-1 text-left ${
                          selectedPath === filePath
                            ? "bg-cyan-500/20 text-cyan-300"
                            : "text-slate-300 hover:bg-slate-700/50"
                        }`}
                      >
                        {filePath.split("/").pop()}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-slate-700/60 pt-4">
            <h3 className="text-xs uppercase tracking-[0.14em] text-slate-400">Operations</h3>
            <div className="mt-2 grid grid-cols-1 gap-2">
              <button
                onClick={() => setState(INITIAL_STATE)}
                className="rounded-md border border-slate-500/50 px-3 py-2 text-left text-xs hover:bg-slate-700/50"
              >
                Rebuild memory from baseline state
              </button>
              <button
                onClick={runNextDemoStep}
                className="rounded-md bg-cyan-500 px-3 py-2 text-left text-xs font-medium text-slate-950 hover:bg-cyan-400"
              >
                Process next incoming update
              </button>
            </div>
          </div>

          <div className="mt-6 border-t border-slate-700/60 pt-4">
            <h3 className="text-xs uppercase tracking-[0.14em] text-slate-400">Dynamic Dataset Ingestion</h3>
            <div className="mt-2 space-y-2">
              <select
                value={inputSourceType}
                onChange={(event) => setInputSourceType(event.target.value as SourceType)}
                className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs"
              >
                <option value="crm">CRM</option>
                <option value="email">Email</option>
                <option value="hr">HR</option>
                <option value="ticket">Ticket</option>
                <option value="policy">Policy</option>
                <option value="collab">Collaboration/Workspace</option>
                <option value="it">IT Service</option>
                <option value="business">Business Record</option>
              </select>
              <input
                value={inputSourceId}
                onChange={(event) => setInputSourceId(event.target.value)}
                placeholder="Source ID"
                className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs"
              />
              <textarea
                value={inputContent}
                onChange={(event) => setInputContent(event.target.value)}
                placeholder="Paste raw record content from judge dataset"
                rows={3}
                className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs"
              />
              <button
                onClick={ingestSingleRecord}
                className="w-full rounded bg-emerald-500 px-2 py-1 text-xs font-semibold text-emerald-950"
              >
                Ingest Single Record
              </button>
              <input
                type="file"
                accept=".json,.csv,.txt"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  void handleDatasetFile(file);
                }}
                className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs"
              />
              <textarea
                value={bulkPayload}
                onChange={(event) => setBulkPayload(event.target.value)}
                placeholder='Paste dataset payload: JSON array or CSV (sourceType,sourceId,content,timestamp)'
                rows={5}
                className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs"
              />
              <button
                onClick={ingestBulkPayload}
                className="w-full rounded bg-cyan-500 px-2 py-1 text-xs font-semibold text-slate-950"
              >
                Ingest Dataset Payload
              </button>
              {ingestMessage ? <p className="text-[11px] text-cyan-200">{ingestMessage}</p> : null}
            </div>
          </div>

          <div className="mt-6 border-t border-slate-700/60 pt-4">
            <h3 className="text-xs uppercase tracking-[0.14em] text-slate-400">Incoming Fragmented Records</h3>
            <div className="mt-2 max-h-52 space-y-2 overflow-auto pr-1">
              {state.rawRecords.map((record) => (
                <article key={record.id} className="rounded-md border border-slate-700/80 bg-slate-900/40 p-2">
                  <p className="text-xs text-cyan-300">
                    {record.sourceType.toUpperCase()} · {record.sourceId}
                  </p>
                  <p className="mt-1 text-xs text-slate-300">{record.content}</p>
                </article>
              ))}
            </div>
          </div>
        </aside>

        <section className="rounded-lg border border-slate-700/80 bg-[#0d1425] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-300">Memory File Viewer</h2>
          {!selectedEntity ? (
            <p className="mt-4 text-slate-400">Choose a file from the virtual file system.</p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-4">
                <p className="text-xs uppercase tracking-[0.13em] text-slate-400">{selectedEntity.filePath}</p>
                <h3 className="mt-1 text-xl font-semibold text-white">{selectedEntity.slug}</h3>
                <p className="mt-2 text-sm text-slate-300">{selectedEntity.summary}</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
                  <h4 className="text-xs uppercase tracking-[0.13em] text-slate-400">Facts</h4>
                  <div className="mt-2 space-y-2">
                    {selectedEntity.facts.map((fact) => (
                      <FactCard
                        key={fact.id}
                        fact={fact}
                        active={selectedFact?.id === fact.id}
                        onSelect={() => setSelectedFactId(fact.id)}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <ContextList title="Linked Entities" entries={selectedEntity.linkedEntityIds} />
                  <ContextList title="Active Tasks" entries={selectedEntity.activeTasks} />
                  <ContextList title="Open Tickets" entries={selectedEntity.openTickets} />
                  <ContextList title="Policy References" entries={selectedEntity.policyRefs} />
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="rounded-lg border border-slate-700/80 bg-[#0d1425] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-300">Context Inspector</h2>

          <div className="mt-3 rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
            <h3 className="text-xs uppercase tracking-[0.12em] text-slate-400">Provenance</h3>
            {!selectedFact ? (
              <p className="mt-2 text-sm text-slate-400">Select a fact to inspect source-level evidence.</p>
            ) : (
              <div className="mt-2 space-y-2 text-sm">
                <p className="text-white">
                  <span className="text-slate-400">Fact:</span> {selectedFact.key} = {selectedFact.value}
                </p>
                <p className="text-slate-300">
                  Source: {selectedFact.sourceType.toUpperCase()} #{selectedFact.sourceId}
                </p>
                <span
                  className={`inline-block rounded border px-2 py-1 text-xs ${confidenceTone(
                    selectedFact.confidence
                  )}`}
                >
                  Confidence {(selectedFact.confidence * 100).toFixed(0)}%
                </span>
                {selectedFact.externalVerified ? (
                  <p className="text-xs text-cyan-200">
                    External Verified {selectedFact.externalSourceUrl ? `· ${selectedFact.externalSourceUrl}` : ""}
                  </p>
                ) : null}
                <p className="text-xs text-slate-400">Updated {formatTimestamp(selectedFact.timestamp)}</p>
              </div>
            )}
          </div>

          <div className="mt-3 rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
            <h3 className="text-xs uppercase tracking-[0.12em] text-slate-400">Relationship Graph</h3>
            <div className="mt-2 space-y-1 text-sm">
              {state.relationships.map((edge) => (
                <p key={edge.id} className="rounded bg-slate-800/80 px-2 py-1 text-slate-200">
                  {edge.from} <span className="text-cyan-300">→ {edge.relation} →</span> {edge.to}
                </p>
              ))}
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
            <h3 className="text-xs uppercase tracking-[0.12em] text-slate-400">Challenge Alignment</h3>
            <div className="mt-2 space-y-1 text-xs text-slate-300">
              <p className="rounded bg-slate-800/80 px-2 py-1">1) Fragmented sources ingested: {challengeInsights.uniqueSources}/5</p>
              <p className="rounded bg-slate-800/80 px-2 py-1">
                2) Structured memory + graph: {challengeInsights.totalFacts} facts / {state.relationships.length} links
              </p>
              <p className="rounded bg-slate-800/80 px-2 py-1">
                3) Fact-level provenance: {challengeInsights.provenanceCoverage}% coverage
              </p>
              <p className="rounded bg-slate-800/80 px-2 py-1">
                4) Auto updates: {challengeInsights.automationRate}% of resolved changes
              </p>
              <p className="rounded bg-slate-800/80 px-2 py-1">
                5) Human governance: {pendingReviews.length} pending ambiguous updates
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
            <h3 className="text-xs uppercase tracking-[0.12em] text-slate-400">Human Review Queue</h3>
            <div className="mt-2 space-y-2">
              {pendingReviews.length === 0 ? (
                <p className="text-sm text-emerald-300">No pending ambiguity. System is auto-resolving.</p>
              ) : (
                pendingReviews.map((item) => (
                  <article key={item.id} className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
                    <p className="text-amber-200">{item.entityId}</p>
                    <p className="text-slate-200">
                      {item.factKey}: {item.oldValue} → {item.proposedValue}
                    </p>
                    <p className="text-xs text-slate-300">
                      {(item.confidence * 100).toFixed(0)}% confidence · {item.sourceType.toUpperCase()} #{item.sourceId}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => setState((prev) => applyReviewDecision(prev, item.id, "approved"))}
                        className="rounded bg-emerald-500 px-2 py-1 text-xs font-semibold text-emerald-950"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setState((prev) => applyReviewDecision(prev, item.id, "rejected"))}
                        className="rounded bg-rose-500 px-2 py-1 text-xs font-semibold text-rose-950"
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
            <h3 className="text-xs uppercase tracking-[0.12em] text-slate-400">Update History</h3>
            <div className="mt-2 max-h-44 space-y-2 overflow-auto pr-1 text-sm">
              {state.updateHistory.length === 0 ? (
                <p className="text-slate-400">No updates yet. Run demo steps to stream changes.</p>
              ) : (
                state.updateHistory.map((item) => (
                  <p key={item.id} className="rounded bg-slate-800/80 px-2 py-1 text-slate-200">
                    <span className="text-cyan-300">{item.action}</span> · {item.factKey}: {item.oldValue} →{" "}
                    {item.newValue}
                  </p>
                ))
              )}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

function InsightCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-slate-700/70 bg-[#0d1425] px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.13em] text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-cyan-200">{value}</p>
    </article>
  );
}

function FactCard({
  fact,
  active,
  onSelect,
}: {
  fact: Fact;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded border px-3 py-2 text-left text-sm ${
        active
          ? "border-cyan-500/70 bg-cyan-500/10"
          : "border-slate-700/70 bg-slate-800/50 hover:border-slate-500"
      }`}
    >
      <p className="text-slate-100">
        {fact.key}: <span className="font-semibold">{fact.value}</span>
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className={`rounded border px-2 py-0.5 text-xs ${confidenceTone(fact.confidence)}`}>
          {(fact.confidence * 100).toFixed(0)}%
        </span>
        <div className="text-right">
          <span className="block text-xs text-slate-400">
            {fact.sourceType.toUpperCase()} #{fact.sourceId}
          </span>
          {fact.externalVerified ? <span className="text-[10px] text-cyan-200">External Verified</span> : null}
        </div>
      </div>
    </button>
  );
}

function ContextList({ title, entries }: { title: string; entries: string[] }) {
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
      <h4 className="text-xs uppercase tracking-[0.13em] text-slate-400">{title}</h4>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">None</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {entries.map((entry) => (
            <span key={entry} className="rounded-full bg-slate-700/70 px-2 py-1 text-xs text-slate-200">
              {entry}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
