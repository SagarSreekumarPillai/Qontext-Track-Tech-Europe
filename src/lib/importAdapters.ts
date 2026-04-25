import type { RawRecord, SourceType } from "@/lib/qontext";

type AdapterResult = {
  records: RawRecord[];
  adapterName: string;
  diagnostics?: {
    totalRows: number;
    parsedRows: number;
    droppedRows: number;
    inferredSourceCounts: Partial<Record<SourceType, number>>;
    warnings: string[];
  };
};

type HeaderMap = Record<string, number>;

function safeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeSourceType(value: string): SourceType {
  const v = value.toLowerCase();
  if (["crm", "salesforce", "hubspot"].includes(v)) return "crm";
  if (["email", "mail", "gmail", "outlook"].includes(v)) return "email";
  if (["hr", "workday", "personnel"].includes(v)) return "hr";
  if (["ticket", "support", "zendesk", "jira"].includes(v)) return "ticket";
  if (["policy", "sop", "rules"].includes(v)) return "policy";
  if (["collab", "workspace", "slack", "notion", "confluence"].includes(v)) return "collab";
  if (["it", "cmdb", "service"].includes(v)) return "it";
  return "business";
}

function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let curr = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        curr += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cols.push(curr.trim());
      curr = "";
      continue;
    }
    curr += ch;
  }
  cols.push(curr.trim());
  return cols;
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map(parseCsvLine);
  return { headers, rows };
}

function stripJsonComments(input: string): string {
  return input.replace(/\/\/.*$/gm, "").replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");
}

function indexHeaders(headers: string[]): HeaderMap {
  const map: HeaderMap = {};
  headers.forEach((h, i) => {
    map[h] = i;
  });
  return map;
}

function pick(row: string[], map: HeaderMap, names: string[]) {
  for (const name of names) {
    if (map[name] !== undefined) return row[map[name]] ?? "";
  }
  return "";
}

function record(id: string, sourceType: SourceType, sourceId: string, content: string, timestamp?: string): RawRecord {
  return {
    id,
    sourceType,
    sourceId,
    content,
    timestamp: timestamp || new Date().toISOString(),
  };
}

function adaptGenericCsv(text: string): AdapterResult {
  const { headers, rows } = parseCsv(text);
  const map = indexHeaders(headers);
  const inferredSourceCounts: Partial<Record<SourceType, number>> = {};
  const warnings: string[] = [];
  const materialized = rows.map((row, idx) => {
    const sourceType = normalizeSourceType(pick(row, map, ["sourcetype", "source_type", "system"]) || "crm");
    inferredSourceCounts[sourceType] = (inferredSourceCounts[sourceType] ?? 0) + 1;
    const sourceId = pick(row, map, ["sourceid", "source_id", "id", "record_id"]) || `CSV-${idx + 1}`;
    const direct = pick(row, map, ["content", "text", "body", "description", "notes"]);
    const account = pick(row, map, ["acct name", "account name", "company", "customer", "deal name"]);
    const owner = pick(row, map, ["ownername", "owner", "account owner", "deal owner", "assignee"]);
    const stage = pick(row, map, ["deal_stage", "deal stage", "status", "stage"]);
    const amount = pick(row, map, ["arr €", "arr", "amount", "annual revenue"]);
    const subject = pick(row, map, ["subject", "summary", "title"]);
    const synthesized = [
      account && `account ${account}`,
      owner && `owner ${owner}`,
      stage && `stage ${stage}`,
      amount && `amount ${amount}`,
      subject && subject,
      direct && direct,
    ]
      .filter(Boolean)
      .join("; ");
    const content = synthesized || direct;
    const timestamp = pick(row, map, ["timestamp", "created_at", "updated_at", "date"]);
    const raw = record(`csv-${idx}-${Date.now()}`, sourceType, sourceId, content, timestamp);
    if (!raw.content.trim()) {
      warnings.push(`Row ${idx + 1}: empty synthesized content`);
    }
    return raw;
  });
  const records = materialized.filter((r) => r.content.trim());
  return {
    records,
    adapterName: "generic-csv",
    diagnostics: {
      totalRows: rows.length,
      parsedRows: records.length,
      droppedRows: rows.length - records.length,
      inferredSourceCounts,
      warnings,
    },
  };
}

function adaptSalesforceCsv(text: string): AdapterResult {
  const { headers, rows } = parseCsv(text);
  const map = indexHeaders(headers);
  const records = rows.map((row, idx) => {
    const account = pick(row, map, ["account name", "name", "accountname"]);
    const owner = pick(row, map, ["account owner", "owner name", "owner"]);
    const amount = pick(row, map, ["amount", "arr", "annual revenue"]);
    const stage = pick(row, map, ["stage", "status"]);
    const sourceId = pick(row, map, ["id", "account id", "opportunity id"]) || `SF-${idx + 1}`;
    const content = `Salesforce export: account ${account}; owner ${owner}; stage ${stage}; amount ${amount}.`;
    return record(`sf-${idx}-${Date.now()}`, "crm", sourceId, content);
  });
  const filtered = records.filter((r) => r.content.trim());
  return {
    records: filtered,
    adapterName: "salesforce-csv",
    diagnostics: {
      totalRows: rows.length,
      parsedRows: filtered.length,
      droppedRows: rows.length - filtered.length,
      inferredSourceCounts: { crm: filtered.length },
      warnings: [],
    },
  };
}

function adaptHubSpotCsv(text: string): AdapterResult {
  const { headers, rows } = parseCsv(text);
  const map = indexHeaders(headers);
  const records = rows.map((row, idx) => {
    const company = pick(row, map, ["company name", "dealname", "deal name", "company"]);
    const owner = pick(row, map, ["deal owner", "contact owner", "hubspot_owner_id"]);
    const stage = pick(row, map, ["deal stage", "lifecyclestage", "lifecycle stage"]);
    const amount = pick(row, map, ["amount", "arr", "mrr"]);
    const sourceId = pick(row, map, ["record id", "deal id", "id"]) || `HS-${idx + 1}`;
    const content = `HubSpot export: company ${company}; owner ${owner}; lifecycle/stage ${stage}; amount ${amount}.`;
    return record(`hs-${idx}-${Date.now()}`, "crm", sourceId, content);
  });
  const filtered = records.filter((r) => r.content.trim());
  return {
    records: filtered,
    adapterName: "hubspot-csv",
    diagnostics: {
      totalRows: rows.length,
      parsedRows: filtered.length,
      droppedRows: rows.length - filtered.length,
      inferredSourceCounts: { crm: filtered.length },
      warnings: [],
    },
  };
}

function adaptZendeskCsv(text: string): AdapterResult {
  const { headers, rows } = parseCsv(text);
  const map = indexHeaders(headers);
  const records = rows.map((row, idx) => {
    const ticketId = pick(row, map, ["ticket id", "id"]) || `ZD-${idx + 1}`;
    const status = pick(row, map, ["status"]);
    const priority = pick(row, map, ["priority"]);
    const subject = pick(row, map, ["subject"]);
    const requester = pick(row, map, ["requester"]);
    const content = `Zendesk ticket ${ticketId}: subject ${subject}; requester ${requester}; status ${status}; priority ${priority}.`;
    return record(`zd-${idx}-${Date.now()}`, "ticket", ticketId, content);
  });
  const filtered = records.filter((r) => r.content.trim());
  return {
    records: filtered,
    adapterName: "zendesk-csv",
    diagnostics: {
      totalRows: rows.length,
      parsedRows: filtered.length,
      droppedRows: rows.length - filtered.length,
      inferredSourceCounts: { ticket: filtered.length },
      warnings: [],
    },
  };
}

function adaptJiraCsv(text: string): AdapterResult {
  const { headers, rows } = parseCsv(text);
  const map = indexHeaders(headers);
  const records = rows.map((row, idx) => {
    const key = pick(row, map, ["issue key", "key"]) || `JIRA-${idx + 1}`;
    const summary = pick(row, map, ["summary"]);
    const status = pick(row, map, ["status"]);
    const priority = pick(row, map, ["priority"]);
    const assignee = pick(row, map, ["assignee"]);
    const content = `Jira issue ${key}: ${summary}; status ${status}; priority ${priority}; assignee ${assignee}.`;
    return record(`jira-${idx}-${Date.now()}`, "ticket", key, content);
  });
  const filtered = records.filter((r) => r.content.trim());
  return {
    records: filtered,
    adapterName: "jira-csv",
    diagnostics: {
      totalRows: rows.length,
      parsedRows: filtered.length,
      droppedRows: rows.length - filtered.length,
      inferredSourceCounts: { ticket: filtered.length },
      warnings: [],
    },
  };
}

function looksLikeSlackExport(json: unknown): json is { messages: Array<{ text?: string; ts?: string; user?: string }> } {
  if (!json || typeof json !== "object") return false;
  const value = json as { messages?: unknown[] };
  return Array.isArray(value.messages);
}

function adaptJson(input: unknown): AdapterResult {
  if (Array.isArray(input)) {
    const inferredSourceCounts: Partial<Record<SourceType, number>> = {};
    const materialized = input
      .map((item, idx) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const sourceType = normalizeSourceType(String(row.sourceType ?? row.source_type ?? row.system ?? "business"));
        inferredSourceCounts[sourceType] = (inferredSourceCounts[sourceType] ?? 0) + 1;
        const sourceId = String(row.sourceId ?? row.source_id ?? row.id ?? `JSON-${idx + 1}`);
        const content =
          String(
            row.content ??
              row.text ??
              row.body ??
              row.description ??
              row.notes ??
              `Record ${sourceId} from ${sourceType} export.`
          );
        const timestamp = String(row.timestamp ?? row.created_at ?? row.updated_at ?? new Date().toISOString());
        return record(`json-${idx}-${Date.now()}`, sourceType, sourceId, content, timestamp);
      })
      .filter((r): r is RawRecord => Boolean(r));
    const records = materialized.filter((r) => r.content.trim());
    return {
      records,
      adapterName: "json-array",
      diagnostics: {
        totalRows: input.length,
        parsedRows: records.length,
        droppedRows: input.length - records.length,
        inferredSourceCounts,
        warnings: [],
      },
    };
  }

  if (looksLikeSlackExport(input)) {
    const records = input.messages.map((message, idx) =>
      record(
        `slack-${idx}-${Date.now()}`,
        "collab",
        `SLACK-${idx + 1}`,
        String(message.text ?? ""),
        message.ts ? new Date(Number(message.ts.split(".")[0]) * 1000).toISOString() : undefined
      )
    );
    const filtered = records.filter((r) => r.content.trim());
    return {
      records: filtered,
      adapterName: "slack-json",
      diagnostics: {
        totalRows: input.messages.length,
        parsedRows: filtered.length,
        droppedRows: input.messages.length - filtered.length,
        inferredSourceCounts: { collab: filtered.length },
        warnings: [],
      },
    };
  }

  if (input && typeof input === "object") {
    const row = input as Record<string, unknown>;
    const sourceType = normalizeSourceType(String(row.sourceType ?? row.source_type ?? row.system ?? "business"));
    const sourceId = String(row.sourceId ?? row.source_id ?? row.id ?? `OBJ-${safeSlug(sourceType)}`);
    const content = String(row.content ?? row.text ?? row.description ?? JSON.stringify(row));
    return {
      records: [record(`obj-${Date.now()}`, sourceType, sourceId, content)],
      adapterName: "json-object",
      diagnostics: {
        totalRows: 1,
        parsedRows: 1,
        droppedRows: 0,
        inferredSourceCounts: { [sourceType]: 1 },
        warnings: [],
      },
    };
  }

  return {
    records: [],
    adapterName: "json-unknown",
    diagnostics: {
      totalRows: 0,
      parsedRows: 0,
      droppedRows: 0,
      inferredSourceCounts: {},
      warnings: ["JSON payload did not match known object/array structures."],
    },
  };
}

function detectCsvAdapter(headers: string[]): "salesforce" | "hubspot" | "zendesk" | "jira" | "generic" {
  const joined = headers.join("|");
  if ((joined.includes("account owner") || joined.includes("opportunity id")) && (joined.includes("account name") || joined.includes("name"))) return "salesforce";
  if (joined.includes("deal stage") || joined.includes("hubspot_owner_id")) return "hubspot";
  if (joined.includes("ticket id") && joined.includes("requester")) return "zendesk";
  if (joined.includes("issue key") || joined.includes("assignee")) return "jira";
  return "generic";
}

export function parseDatasetPayload(payload: string, fileName?: string): AdapterResult {
  const trimmed = payload.trim();
  if (!trimmed)
    return {
      records: [],
      adapterName: "empty",
      diagnostics: {
        totalRows: 0,
        parsedRows: 0,
        droppedRows: 0,
        inferredSourceCounts: {},
        warnings: ["Empty payload."],
      },
    };

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(stripJsonComments(trimmed));
      return adaptJson(parsed);
    } catch {
      return {
        records: [],
        adapterName: "json-parse-failed",
        diagnostics: {
          totalRows: 0,
          parsedRows: 0,
          droppedRows: 0,
          inferredSourceCounts: {},
          warnings: ["JSON parse failed even after cleanup."],
        },
      };
    }
  }

  const { headers } = parseCsv(trimmed);
  const adapter = detectCsvAdapter(headers);
  if (adapter === "salesforce") return adaptSalesforceCsv(trimmed);
  if (adapter === "hubspot") return adaptHubSpotCsv(trimmed);
  if (adapter === "zendesk") return adaptZendeskCsv(trimmed);
  if (adapter === "jira") return adaptJiraCsv(trimmed);
  const generic = adaptGenericCsv(trimmed);

  if (generic.records.length === 0 && fileName?.toLowerCase().endsWith(".txt")) {
    const detectLineSourceType = (line: string): SourceType => {
      const lc = line.toLowerCase();
      if (lc.includes("account") || lc.includes("crm")) return "crm";
      if (lc.includes("joined as") || lc.includes("hr")) return "hr";
      if (lc.includes("ticket") || lc.includes("incident")) return "ticket";
      if (lc.includes("policy") || lc.includes("sla")) return "policy";
      if (lc.includes("service") || lc.includes("depends on") || lc.includes("slo")) return "it";
      if (lc.includes("#") || lc.includes("workspace") || lc.includes("slack")) return "collab";
      return "business";
    };
    const lines = trimmed.split(/\r?\n/).filter(Boolean);
    const inferredSourceCounts: Partial<Record<SourceType, number>> = {};
    const records = lines.map((line, idx) =>
      {
        const sourceType = detectLineSourceType(line);
        inferredSourceCounts[sourceType] = (inferredSourceCounts[sourceType] ?? 0) + 1;
        return record(`txt-${idx}-${Date.now()}`, sourceType, `TXT-${idx + 1}`, line, new Date().toISOString());
      }
    );
    const filtered = records.filter((r) => r.content.trim().length > 0);
    return {
      records: filtered,
      adapterName: "plain-text-lines",
      diagnostics: {
        totalRows: lines.length,
        parsedRows: filtered.length,
        droppedRows: lines.length - filtered.length,
        inferredSourceCounts,
        warnings: [],
      },
    };
  }

  return {
    ...generic,
    diagnostics: generic.diagnostics ?? {
      totalRows: generic.records.length,
      parsedRows: generic.records.length,
      droppedRows: 0,
      inferredSourceCounts: {},
      warnings: [],
    },
  };
}
