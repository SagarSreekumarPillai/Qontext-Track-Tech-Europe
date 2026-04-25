import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/server/supabase";

const rawRecordSchema = z.object({
  id: z.string(),
  sourceType: z.enum(["crm", "email", "hr", "ticket", "policy", "collab", "it", "business"]),
  sourceId: z.string(),
  content: z.string(),
  timestamp: z.string(),
});

const payloadSchema = z.object({
  record: rawRecordSchema,
  action: z.enum(["auto_applied", "queued", "approved", "rejected"]).optional(),
  factKey: z.string().optional(),
  oldValue: z.string().optional(),
  newValue: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = payloadSchema.parse(await request.json());
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ ok: true, persisted: false, reason: "Supabase not configured" });
    }

    const rawInsert = await supabase
      .from("raw_records")
      .upsert(
        {
          id: body.record.id,
          source_type: body.record.sourceType,
          source_id: body.record.sourceId,
          content: body.record.content,
          timestamp: body.record.timestamp,
        },
        { onConflict: "id" }
      );
    if (rawInsert.error) {
      return NextResponse.json(
        {
          ok: false,
          error: `raw_records insert failed: ${rawInsert.error.message}`,
          code: rawInsert.error.code,
          details: rawInsert.error.details,
          hint: rawInsert.error.hint,
        },
        { status: 400 }
      );
    }

    if (body.action && body.factKey) {
      const historyInsert = await supabase.from("update_history").insert({
        entity_id: "customer:acme",
        fact_key: body.factKey,
        action: body.action,
        before_value: body.oldValue ?? null,
        after_value: body.newValue ?? null,
        actor: body.action === "approved" || body.action === "rejected" ? "human" : "system",
      });
      if (historyInsert.error) {
        return NextResponse.json(
          {
            ok: false,
            error: `update_history insert failed: ${historyInsert.error.message}`,
            code: historyInsert.error.code,
            details: historyInsert.error.details,
            hint: historyInsert.error.hint,
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ ok: true, persisted: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Ingest failed",
      },
      { status: 400 }
    );
  }
}
