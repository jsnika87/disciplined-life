// src/lib/pillarsClient.ts
import { supabase } from "@/lib/supabaseClient";

/**
 * Your v1 system stores "entry_date" in UTC date (YYYY-MM-DD).
 * We use the same approach as push-cron: take local noon and convert to UTC date.
 */
function localDateToUtcDateISO(localDateISO: string): string {
  // local noon avoids DST/offset edge-cases
  const d = new Date(`${localDateISO}T12:00:00`);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const uid = data?.user?.id;
  if (!uid) throw new Error("Not authenticated.");
  return uid;
}

export async function markPillarComplete(localDateISO: string, pillar: "train" | "eat" | "word" | "freedom") {
  const userId = await requireUserId();
  const entryDateUtc = localDateToUtcDateISO(localDateISO);

  // 1) Ensure daily_entries row exists
  const { data: existingEntry, error: entrySelErr } = await supabase
    .schema("disciplined")
    .from("daily_entries")
    .select("id")
    .eq("user_id", userId)
    .eq("entry_date", entryDateUtc)
    .maybeSingle();

  if (entrySelErr) throw entrySelErr;

  let entryId = existingEntry?.id as string | undefined;

  if (!entryId) {
    const { data: inserted, error: entryInsErr } = await supabase
      .schema("disciplined")
      .from("daily_entries")
      .insert({ user_id: userId, entry_date: entryDateUtc })
      .select("id")
      .single();

    if (entryInsErr) throw entryInsErr;
    entryId = inserted.id;
  }

  // 2) Upsert daily_pillars row
  // We assume a unique constraint exists on (entry_id, pillar). If it doesn't,
  // we'll fall back to update-then-insert behavior below.
  const now = new Date().toISOString();

  const { error: upsertErr } = await supabase
    .schema("disciplined")
    .from("daily_pillars")
    .upsert(
      {
        entry_id: entryId,
        pillar,
        completed: true,
        completed_at: now,
      } as any,
      // If your constraint name differs, Supabase still upserts fine if table has a UNIQUE on (entry_id,pillar).
      { onConflict: "entry_id,pillar" }
    );

  if (!upsertErr) return;

  // Fallback if onConflict doesn't match your schema/constraints
  const { error: updErr } = await supabase
    .schema("disciplined")
    .from("daily_pillars")
    .update({ completed: true, completed_at: now } as any)
    .eq("entry_id", entryId)
    .eq("pillar", pillar);

  if (updErr) throw upsertErr;

  // If update affected 0 rows, insert
  const { data: check, error: checkErr } = await supabase
    .schema("disciplined")
    .from("daily_pillars")
    .select("id")
    .eq("entry_id", entryId)
    .eq("pillar", pillar)
    .limit(1);

  if (checkErr) throw checkErr;
  if ((check?.length ?? 0) > 0) return;

  const { error: insErr } = await supabase
    .schema("disciplined")
    .from("daily_pillars")
    .insert({ entry_id: entryId, pillar, completed: true, completed_at: now } as any);

  if (insErr) throw insErr;
}