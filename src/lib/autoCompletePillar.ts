import { supabase } from "@/lib/supabaseClient";

type PillarKey = "train" | "eat" | "word" | "freedom";

function todayISODateUTC() {
  return new Date().toISOString().slice(0, 10);
}

export async function autoCompletePillar(pillar: PillarKey): Promise<boolean> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) {
    console.error("autoCompletePillar: getUser error", userErr);
    return false;
  }

  const uid = userData.user?.id;
  if (!uid) return false;

  const entryDate = todayISODateUTC();

  // 1) ✅ Atomic get-or-create daily entry (prevents 409 duplicate key races)
  const upsertedEntry = await supabase
    .schema("disciplined")
    .from("daily_entries")
    .upsert({ user_id: uid, entry_date: entryDate }, { onConflict: "user_id,entry_date" })
    .select("id")
    .single<{ id: string }>();

  if (upsertedEntry.error) {
    console.error("autoCompletePillar: daily_entries upsert error", upsertedEntry.error, {
      uid,
      entryDate,
    });
    return false;
  }

  const entryId = upsertedEntry.data.id;

  // 2) Ensure pillar row exists WITHOUT overwriting existing values
  const seed = await supabase
    .schema("disciplined")
    .from("daily_pillars")
    .upsert(
      [
        {
          entry_id: entryId,
          pillar,
          completed: false,
          completed_at: null,
          source: null,
        },
      ],
      { onConflict: "entry_id,pillar", ignoreDuplicates: true }
    );

  if (seed.error) {
    console.error("autoCompletePillar: daily_pillars seed error", seed.error, {
      entryId,
      pillar,
    });
    return false;
  }

  // 3) Check current status (if already complete, do nothing)
  const cur = await supabase
    .schema("disciplined")
    .from("daily_pillars")
    .select("completed,source")
    .eq("entry_id", entryId)
    .eq("pillar", pillar)
    .single<{ completed: boolean; source: "manual" | "auto" | null }>();

  if (cur.error) {
    console.error("autoCompletePillar: daily_pillars select error", cur.error, {
      entryId,
      pillar,
    });
    return false;
  }

  if (cur.data.completed) return false; // already complete (manual or auto)

  // 4) Mark complete (auto)
  const upd = await supabase
    .schema("disciplined")
    .from("daily_pillars")
    .update({
      completed: true,
      completed_at: new Date().toISOString(),
      source: "auto",
    })
    .eq("entry_id", entryId)
    .eq("pillar", pillar)
    .select("completed,source,completed_at")
    .single<{
      completed: boolean;
      source: "manual" | "auto" | null;
      completed_at: string | null;
    }>();

  if (upd.error) {
    console.error("autoCompletePillar: daily_pillars update error", upd.error, {
      entryId,
      pillar,
      uid,
      entryDate,
    });
    return false;
  }

  const changed = upd.data.completed === true;

  // 5) Notify Today to refresh
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("dl:pillar-updated", { detail: { pillar } }));
  }

  return changed;
}