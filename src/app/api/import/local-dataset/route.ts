import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseDatasetPayload } from "@/lib/importAdapters";
import type { RawRecord } from "@/lib/qontext";

const bodySchema = z
  .object({
    maxFiles: z.number().int().min(1).max(200).optional(),
    maxRecordsPerFile: z.number().int().min(1).max(20).optional(),
    maxRecordsTotal: z.number().int().min(1).max(500).optional(),
  })
  .optional();

const DATASET_DIR = path.join(process.cwd(), "Dataset From Qontext", "Dataset");

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walkFiles(full);
      return [full];
    })
  );
  return nested.flat();
}

export async function POST(request: Request) {
  try {
    const parsedBody = bodySchema.parse(await request.json().catch(() => ({})));
    const maxFiles = parsedBody?.maxFiles ?? 40;
    const maxRecordsPerFile = parsedBody?.maxRecordsPerFile ?? 5;
    const maxRecordsTotal = parsedBody?.maxRecordsTotal ?? 120;

    const allFiles = await walkFiles(DATASET_DIR);
    const targetFiles = allFiles
      .filter((file) => /\.(json|csv|txt)$/i.test(file))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, maxFiles);

    const records: RawRecord[] = [];
    const diagnostics: Array<{ file: string; adapter: string; parsed: number; sampled: number }> = [];

    for (const filePath of targetFiles) {
      if (records.length >= maxRecordsTotal) break;
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = parseDatasetPayload(content, path.basename(filePath));
      const remaining = maxRecordsTotal - records.length;
      const sampled = parsed.records.slice(0, Math.min(maxRecordsPerFile, remaining));
      records.push(...sampled);
      diagnostics.push({
        file: filePath.replace(`${process.cwd()}/`, ""),
        adapter: parsed.adapterName,
        parsed: parsed.records.length,
        sampled: sampled.length,
      });
    }

    return NextResponse.json({
      ok: true,
      source: "local-dataset-folder",
      datasetPath: DATASET_DIR,
      filesScanned: targetFiles.length,
      recordsPrepared: records.length,
      records,
      diagnostics,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "local dataset import failed" },
      { status: 400 }
    );
  }
}
