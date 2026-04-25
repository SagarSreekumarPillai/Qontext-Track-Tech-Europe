import type { RawRecord, SourceType } from "@/lib/qontext";

type AdapterResult = {
  records: RawRecord[];
  adapterName: string;
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
  const records = rows.map((row, idx) => {
    const sourceType = normalizeSourceType(pick(row, map, ["sourcetype", "source_type", "system"]) || "crm");
    const sourceId = pick(row, map, ["sourceid", "source_id", "id", "record_id"]) || `CSV-${idx + 1}`;
    const content = pick(row, map, ["content", "text", "body", "description", "notes"]);
    const timestamp = pick(row, map, ["timestamp", "created_at", "updated_at", "date"]);
    return record(`csv-${idx}-${Date.now()}`, sourceType, sourceId, content, timestamp);
  });
  return { records: records.filter((r) => r.content), adapterName: "generic-csv" };
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
  return { records: records.filter((r) => r.content), adapterName: "salesforce-csv" };
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
  return { records: records.filter((r) => r.content), adapterName: "hubspot-csv" };
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
  return { records: records.filter((r) => r.content), adapterName: "zendesk-csv" };
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
  return { records: records.filter((r) => r.content), adapterName: "jira-csv" };
}

function looksLikeSlackExport(json: unknown): json is { messages: Array<{ text?: string; ts?: string; user?: string }> } {
  if (!json || typeof json !== "object") return false;
  const value = json as { messages?: unknown[] };
  return Array.isArray(value.messages);
}

function adaptJson(input: unknown): AdapterResult {
  if (Array.isArray(input)) {
    const records = input
      .map((item, idx) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const sourceType = normalizeSourceType(String(row.sourceType ?? row.source_type ?? row.system ?? "business"));
        const sourceId = String(row.sourceId ?? row.source_id ?? row.id ?? `JSON-${idx + 1}`);
        const content =
          String(
            row.content ??
              row.text ??
              row.body ??
              row.description ??
              `Record ${sourceId} from ${sourceType} export.`
          );
        const timestamp = String(row.timestamp ?? row.created_at ?? row.updated_at ?? new Date().toISOString());
        return record(`json-${idx}-${Date.now()}`, sourceType, sourceId, content, timestamp);
      })
      .filter((r): r is RawRecord => Boolean(r && r.content.trim()));
    return { records, adapterName: "json-array" };
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
    return { records: records.filter((r) => r.content), adapterName: "slack-json" };
  }

  if (input && typeof input === "object") {
    const row = input as Record<string, unknown>;
    const sourceType = normalizeSourceType(String(row.sourceType ?? row.source_type ?? row.system ?? "business"));
    const sourceId = String(row.sourceId ?? row.source_id ?? row.id ?? `OBJ-${safeSlug(sourceType)}`);
    const content = String(row.content ?? row.text ?? row.description ?? JSON.stringify(row));
    return {
      records: [record(`obj-${Date.now()}`, sourceType, sourceId, content)],
      adapterName: "json-object",
    };
  }

  return { records: [], adapterName: "json-unknown" };
}

function detectCsvAdapter(headers: string[]): "salesforce" | "hubspot" | "zendesk" | "jira" | "generic" {
  const joined = headers.join("|");
  if (joined.includes("account owner") || joined.includes("opportunity id")) return "salesforce";
  if (joined.includes("deal stage") || joined.includes("hubspot_owner_id")) return "hubspot";
  if (joined.includes("ticket id") && joined.includes("requester")) return "zendesk";
  if (joined.includes("issue key") || joined.includes("assignee")) return "jira";
  return "generic";
}

export function parseDatasetPayload(payload: string, fileName?: string): AdapterResult {
  const trimmed = payload.trim();
  if (!trimmed) return { records: [], adapterName: "empty" };

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      return adaptJson(parsed);
    } catch {
      return { records: [], adapterName: "json-parse-failed" };
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
    const lines = trimmed.split(/\r?\n/).filter(Boolean);
    const records = lines.map((line, idx) =>
      record(`txt-${idx}-${Date.now()}`, "business", `TXT-${idx + 1}`, line, new Date().toISOString())
    );
    return { records, adapterName: "plain-text-lines" };
  }

  return generic;
}
