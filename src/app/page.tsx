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
import { parseDatasetPayload } from "@/lib/importAdapters";

function confidenceTone(confidence: number) {
  if (confidence > 0.9) return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  if (confidence > 0.75) return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  return "bg-rose-500/20 text-rose-300 border-rose-500/40";
}

function formatTimestamp(timestamp: string) {
  const iso = new Date(timestamp).toISOString();
  return iso.replace("T", " ").replace("Z", " UTC");
}

const INTRO_SLIDES = [
  {
    title: "Welcome to LoomOS",
    subtitle: "Operating system for company memory",
    points: [
      "Ingest fragmented company records from CRM, email, HR, tickets, policies, and IT systems.",
      "Normalize raw records into machine-readable entity memory files.",
      "Make enterprise state legible to both humans and AI systems.",
    ],
  },
  {
    title: "Inspectable Virtual Memory",
    subtitle: "Files + graph + provenance",
    points: [
      "Browse entities in a virtual file system across customers, employees, projects, and policies.",
      "Inspect relationship graph links to understand cross-entity context.",
      "Trace every fact to source system, record id, confidence, and update time.",
    ],
  },
  {
    title: "Controlled Automation",
    subtitle: "Auto where clear, human where ambiguous",
    points: [
      "High-confidence updates auto-apply and update memory/graph state.",
      "Ambiguous updates route into a human review queue with full evidence.",
      "Data quality report validates imported datasets before processing.",
    ],
  },
];

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
  const [attachedFileName, setAttachedFileName] = useState("");
  const [previewStatus, setPreviewStatus] = useState<{
    adapter: string;
    count: number;
    ok: boolean;
    error?: string;
    diagnostics?: {
      totalRows: number;
      parsedRows: number;
      droppedRows: number;
      inferredSourceCounts: Record<string, number>;
      warnings: string[];
    };
  } | null>(null);
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem("loomos_intro_seen") !== "1";
    } catch {
      return true;
    }
  });
  const [introStep, setIntroStep] = useState(0);

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
  const lastChange = state.updateHistory[0];
  const activeIntro = INTRO_SLIDES[introStep];

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

  const closeIntro = () => {
    setShowIntro(false);
    try {
      window.localStorage.setItem("loomos_intro_seen", "1");
    } catch {
      // ignore localStorage access issues
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

  const ingestBulkPayload = async (fileName?: string) => {
    const payload = bulkPayload.trim();
    if (!payload) {
      setIngestMessage("Paste JSON array or CSV payload first.");
      return;
    }
    const adapted = parseDatasetPayload(payload, fileName);
    const records: RawRecord[] = adapted.records;

    if (!records.length) {
      setIngestMessage(
        "Could not parse payload. Supported: Salesforce/HubSpot/Zendesk/Jira CSV, Slack JSON, generic JSON/CSV."
      );
      return;
    }

    for (const record of records) {
      if (record.content) {
        await processIncomingRecord(record);
      }
    }
    setIngestMessage(`Ingested ${records.length} records using ${adapted.adapterName} adapter.`);
  };

  const handleDatasetFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    setBulkPayload(text);
    setAttachedFileName(file.name);
    const preview = parseDatasetPayload(text, file.name);
    setIngestMessage(
      `Loaded ${file.name}. Detected ${preview.adapterName} adapter with ${preview.records.length} compatible records.`
    );
  };

  const previewImportCompatibility = async () => {
    const payload = bulkPayload.trim();
    if (!payload) {
      setPreviewStatus({ ok: false, adapter: "none", count: 0, error: "No payload provided." });
      return;
    }
    try {
      const res = await fetch("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload,
          fileName: attachedFileName || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setPreviewStatus({
          ok: false,
          adapter: "unknown",
          count: 0,
          error: json.error ?? "Preview failed",
        });
        return;
      }
      setPreviewStatus({
        ok: true,
        adapter: json.adapter,
        count: json.count,
        diagnostics: json.diagnostics,
      });
    } catch {
      setPreviewStatus({
        ok: false,
        adapter: "unknown",
        count: 0,
        error: "Preview request failed.",
      });
    }
  };

  return (
    <main className="min-h-screen bg-[#090d17] text-slate-100">
      {showIntro ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050913]/95 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-cyan-500/30 bg-[#0b1424] p-6 shadow-2xl shadow-cyan-900/20">
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">LoomOS Guided Loading</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{activeIntro.title}</h2>
            <p className="mt-1 text-sm text-slate-300">{activeIntro.subtitle}</p>
            <div className="mt-4 space-y-2">
              {activeIntro.points.map((point) => (
                <p key={point} className="rounded-md bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
                  {point}
                </p>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {INTRO_SLIDES.map((slide, idx) => (
                  <button
                    key={slide.title}
                    onClick={() => setIntroStep(idx)}
                    className={`h-2 w-8 rounded-full ${
                      idx === introStep ? "bg-cyan-300" : "bg-slate-600"
                    }`}
                    title={`Go to slide ${idx + 1}`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={closeIntro}
                  className="rounded-md border border-slate-500/70 px-3 py-1.5 text-sm text-slate-200"
                >
                  Skip
                </button>
                <button
                  onClick={() => setIntroStep((s) => Math.max(0, s - 1))}
                  disabled={introStep === 0}
                  className="rounded-md border border-slate-500/70 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-40"
                >
                  Back
                </button>
                {introStep < INTRO_SLIDES.length - 1 ? (
                  <button
                    onClick={() => setIntroStep((s) => Math.min(INTRO_SLIDES.length - 1, s + 1))}
                    className="rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    onClick={closeIntro}
                    className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-emerald-950"
                  >
                    Enter LoomOS
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
            <p className="text-xs text-cyan-200">{integrationStatus.replace("Provider", "Extraction Engine")}</p>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2 px-3 pt-3 md:grid-cols-3 xl:grid-cols-6">
        <InsightCard
          label="Fragmented Sources"
          value={`${challengeInsights.uniqueSources}/5`}
          tooltip="How many source systems are currently represented in memory."
        />
        <InsightCard
          label="Memory Facts"
          value={String(challengeInsights.totalFacts)}
          tooltip="Total structured facts currently stored across entities."
        />
        <InsightCard
          label="Provenance Coverage"
          value={`${challengeInsights.provenanceCoverage}%`}
          tooltip="Percent of facts that are traceable to source records."
        />
        <InsightCard
          label="Automation Rate"
          value={`${challengeInsights.automationRate}%`}
          tooltip="Share of resolved updates auto-applied without human review."
        />
        <InsightCard
          label="Human Resolution"
          value={`${challengeInsights.humanResolutionRate}%`}
          tooltip="Share of queued ambiguous updates that humans resolved."
        />
        <InsightCard
          label="High-Confidence Facts"
          value={`${challengeInsights.highConfidenceRate}%`}
          tooltip="Portion of facts currently above the high-confidence threshold."
        />
      </section>

      <section className="px-3 pt-3">
        <div className="rounded-lg border border-slate-700/70 bg-[#0d1425] px-3 py-2 text-sm">
          <p className="text-slate-300">
            <span className="text-cyan-300">Last Change:</span>{" "}
            {lastChange
              ? `${lastChange.action} · ${lastChange.factKey}: ${lastChange.oldValue} → ${lastChange.newValue}`
              : "No updates yet. Ingest a record to see memory evolution."}
          </p>
        </div>
        <div className="mt-2 rounded-lg border border-slate-700/70 bg-[#0d1425] px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-slate-300">
              <span className="text-cyan-300">Guided Demo:</span>{" "}
              {[
                "Open customer memory file",
                "Auto-apply high-confidence update",
                "Queue ambiguous update for review",
                "Approve queued update",
              ][Math.min(demoStep, 3)]}
            </p>
            <div className="flex gap-2">
              <button
                onClick={runNextDemoStep}
                className="rounded bg-cyan-500 px-2 py-1 text-xs font-semibold text-slate-950"
              >
                Run Next Step
              </button>
              <button
                onClick={() => {
                  setState(INITIAL_STATE);
                  setDemoStep(0);
                  setSelectedPath("/customers/acme.md");
                  setSelectedFactId("f_owner");
                }}
                className="rounded border border-slate-500/70 px-2 py-1 text-xs text-slate-200"
              >
                Reset Walkthrough
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid h-[calc(100vh-210px)] min-h-[620px] grid-cols-1 gap-3 overflow-hidden p-3 xl:grid-cols-[280px_1fr_380px]">
        <aside className="h-full overflow-y-auto rounded-lg border border-slate-700/80 bg-[#0d1425] p-4">
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
              <details className="rounded border border-slate-700/70 bg-slate-900/40 p-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-200">
                  Advanced Import (bulk files and compatibility validation)
                </summary>
                <div className="mt-2 space-y-2">
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
                    onClick={() => void ingestBulkPayload()}
                    className="w-full rounded bg-cyan-500 px-2 py-1 text-xs font-semibold text-slate-950"
                  >
                    Ingest Dataset Payload
                  </button>
                  <button
                    onClick={previewImportCompatibility}
                    className="w-full rounded border border-cyan-400/60 px-2 py-1 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/10"
                  >
                    Validate Import Compatibility
                  </button>
                  {previewStatus ? (
                    <p className={`text-[11px] ${previewStatus.ok ? "text-emerald-300" : "text-rose-300"}`}>
                      {previewStatus.ok
                        ? `Adapter ${previewStatus.adapter} recognized ${previewStatus.count} records.`
                        : `Validation failed: ${previewStatus.error}`}
                    </p>
                  ) : null}
              {previewStatus?.ok && previewStatus.diagnostics ? (
                <div className="rounded border border-slate-700/70 bg-slate-900/60 p-2 text-[10px] text-slate-300">
                  <p className="font-semibold text-cyan-200">Data Quality Report</p>
                  <p>
                    Parsed {previewStatus.diagnostics.parsedRows}/{previewStatus.diagnostics.totalRows} rows (dropped{" "}
                    {previewStatus.diagnostics.droppedRows})
                  </p>
                  <p>
                    Inferred sources:{" "}
                    {Object.entries(previewStatus.diagnostics.inferredSourceCounts)
                      .map(([k, v]) => `${k}:${v}`)
                      .join(", ") || "none"}
                  </p>
                  {previewStatus.diagnostics.warnings.length > 0 ? (
                    <p className="text-amber-300">
                      Warnings: {previewStatus.diagnostics.warnings.slice(0, 2).join(" | ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
                  <p className="text-[10px] text-slate-400">
                    Compatible exports: Salesforce, HubSpot, Zendesk, Jira CSV; Slack JSON; generic JSON/CSV/TXT.
                  </p>
                </div>
              </details>
              {ingestMessage ? <p className="text-[11px] text-cyan-200">{ingestMessage}</p> : null}
            </div>
          </div>

          <div className="mt-6 border-t border-slate-700/60 pt-4">
            <h3 className="text-xs uppercase tracking-[0.14em] text-slate-400">Connector Templates</h3>
            <div className="mt-2 space-y-2 text-[10px] text-slate-300">
              <p className="rounded bg-slate-900/70 px-2 py-1">
                Salesforce CSV: <span className="text-cyan-200">Id, Account Name, Account Owner, Stage, Amount</span>
              </p>
              <p className="rounded bg-slate-900/70 px-2 py-1">
                HubSpot CSV: <span className="text-cyan-200">Record ID, Deal Name, Deal Owner, Deal Stage, Amount</span>
              </p>
              <p className="rounded bg-slate-900/70 px-2 py-1">
                Zendesk CSV: <span className="text-cyan-200">Ticket ID, Status, Subject, Requester, Priority</span>
              </p>
              <p className="rounded bg-slate-900/70 px-2 py-1">
                Jira CSV: <span className="text-cyan-200">Issue key, Summary, Status, Priority, Assignee</span>
              </p>
              <p className="rounded bg-slate-900/70 px-2 py-1">
                Slack JSON: <span className="text-cyan-200">{`{"messages":[{"text":"...","ts":"..."}]}`}</span>
              </p>
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

        <section className="h-full overflow-y-auto rounded-lg border border-slate-700/80 bg-[#0d1425] p-5">
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

        <aside className="h-full overflow-y-auto rounded-lg border border-slate-700/80 bg-[#0d1425] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-300">Context Inspector</h2>

          <div className="mt-3 rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
            <h3
              className="text-xs uppercase tracking-[0.12em] text-slate-400"
              title="Trace each selected fact back to its source record and confidence."
            >
              Provenance
            </h3>
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
            <h3
              className="text-xs uppercase tracking-[0.12em] text-slate-400"
              title="Machine-usable links between entities extracted from source evidence."
            >
              Relationship Graph
            </h3>
            <div className="mt-2 space-y-1 text-sm">
              {state.relationships.map((edge) => (
                <p key={edge.id} className="rounded bg-slate-800/80 px-2 py-1 text-slate-200">
                  {edge.from} <span className="text-cyan-300">→ {edge.relation} →</span> {edge.to}
                </p>
              ))}
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">
            <h3
              className="text-xs uppercase tracking-[0.12em] text-slate-400"
              title="Live scorecard showing how current system behavior maps to challenge criteria."
            >
              Challenge Alignment
            </h3>
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
            <h3
              className="text-xs uppercase tracking-[0.12em] text-slate-400"
              title="Ambiguous or low-confidence fact updates requiring explicit human approval."
            >
              Human Review Queue
            </h3>
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

function InsightCard({ label, value, tooltip }: { label: string; value: string; tooltip: string }) {
  return (
    <article className="rounded-lg border border-slate-700/70 bg-[#0d1425] px-3 py-2" title={tooltip}>
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
