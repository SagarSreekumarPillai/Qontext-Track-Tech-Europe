import { NextResponse } from "next/server";
import { z } from "zod";
import { parseDatasetPayload } from "@/lib/importAdapters";

const schema = z.object({
  payload: z.string().min(1),
  fileName: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const parsed = parseDatasetPayload(body.payload, body.fileName);
    return NextResponse.json({
      ok: true,
      adapter: parsed.adapterName,
      count: parsed.records.length,
      preview: parsed.records.slice(0, 3),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "preview failed" },
      { status: 400 }
    );
  }
}
