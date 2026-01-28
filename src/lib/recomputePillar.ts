// src/lib/recomputePillar.ts
import { supabase } from "@/lib/supabaseClient";

export type PillarKey = "train" | "eat" | "word" | "freedom";

function todayISODateUTC() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Recomputes whether a pillar should be auto-completed for today.
 *
 * Rules:
 * - If the pillar row is currently source='manual', do NOT overwrite it.
 * - Otherwise, set completed based on pillar-specific data.
 *
 * Currently implemented:
 * - eat: completed if there is at least one meal_item linked to a meal for today
 */
export async function recomputePillar(pillar: PillarKey): Promise<boolean> {
  if (pillar !== "eat") {
    // future: add train/word/freedom recompute rules if desired
    return false;
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) {
    console.error("recomputePillar: getUser error", userErr);
    return false;
  }

  const uid = userData.user?.id;
  if (!uid) return false;

  const entryDate = todayISODateUTC();

  // 1) Ensure daily_entries exists (atomic upsert to avoid duplicate races)
  const entryUp = await supabase
    .schema("disciplined")
    .from("daily_entries")
    .upsert({ user_id: uid, entry_date: entryDate }, { onConflict: "user_id,entry_date" })
    .select("id")
    .single<{ id: string }>();

  if (entryUp.error) {
    console.error("recomputePillar: daily_entries upsert error", entryUp.error);
    return false;
  }

  const entryId = entryUp.data.id;

  // 2) Ensure daily_pillars row exists WITHOUT overwriting existing row
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
    console.error("recomputePillar: daily_pillars seed error", seed.error);
    return false;
  }

  // 3) If user manually set it, do not override
  const cur = await supabase
    .schema("disciplined")
    .from("daily_pillars")
    .select("completed,source")
    .eq("entry_id", entryId)
    .eq("pillar", pillar)
    .single<{ completed: boolean; source: "manual" | "auto" | null }>();

  if (cur.error) {
    console.error("recomputePillar: daily_pillars select error", cur.error);
    return false;
  }

  if (cur.data.source === "manual") {
    return false; // respect manual override
  }

  // 4) Compute desired completed state for EAT:
  //    true if at least one meal_item exists for any meal today
  const mealsRes = await supabase
    .schema("disciplined")
    .from("meals")
    .select("id")
    .eq("user_id", uid)
    .eq("meal_date", entryDate);

  if (mealsRes.error) {
    console.error("recomputePillar: meals select error", mealsRes.error);
    return false;
  }

  const mealIds = (mealsRes.data ?? []).map((m) => m.id as string);

  let shouldComplete = false;

  if (mealIds.length > 0) {
    const itemsRes = await supabase
      .schema("disciplined")
      .from("meal_items")
      .select("id")
      .in("meal_id", mealIds)
      .limit(1);

    if (itemsRes.error) {
      console.error("recomputePillar: meal_items select error", itemsRes.error);
      return false;
    }

    shouldComplete = (itemsRes.data?.length ?? 0) > 0;
  } else {
    shouldComplete = false;
  }

  // 5) If no change needed, stop
  if (cur.data.completed === shouldComplete) {
    return false;
  }

  // 6) Apply auto state
  const upd = await supabase
    .schema("disciplined")
    .from("daily_pillars")
    .update({
      completed: shouldComplete,
      completed_at: shouldComplete ? new Date().toISOString() : null,
      source: shouldComplete ? "auto" : null, // if not complete, clear auto source
    })
    .eq("entry_id", entryId)
    .eq("pillar", pillar)
    .select("completed")
    .single<{ completed: boolean }>();

  if (upd.error) {
    console.error("recomputePillar: daily_pillars update error", upd.error);
    return false;
  }

  // 7) Notify Today page to refresh
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("dl:pillar-updated", { detail: { pillar } }));
  }

  return true;
}