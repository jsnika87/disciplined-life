import { supabase } from "@/lib/supabaseClient";
import type { FastingSettings } from "@/lib/fasting";

export async function getOrCreateFastingSettings(): Promise<FastingSettings> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Not logged in.");

  // Try load
  const existing = await supabase
    .schema("disciplined")
    .from("fasting_settings")
    .select("eating_start,eating_hours")
    .eq("user_id", uid)
    .maybeSingle<{ eating_start: string; eating_hours: number }>();

  if (existing.error) throw existing.error;

  if (existing.data) return existing.data;

  // Create default (16/8 -> eat 8 hours, start at 12:00)
  const created = await supabase
    .schema("disciplined")
    .from("fasting_settings")
    .insert({ user_id: uid, eating_start: "12:00", eating_hours: 8 })
    .select("eating_start,eating_hours")
    .single<{ eating_start: string; eating_hours: number }>();

  if (created.error) throw created.error;

  return created.data;
}

export async function updateFastingSettings(input: { eating_start: string; eating_hours: number }) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Not logged in.");

  const eating_hours = input.eating_hours;

  if (!Number.isFinite(eating_hours) || eating_hours < 1 || eating_hours > 23) {
    throw new Error("Eating hours must be between 1 and 23.");
  }

  // enforce sums to 24 (fasting = 24 - eating)
  const fastingHours = 24 - eating_hours;
  if (fastingHours < 1 || fastingHours > 23) {
    throw new Error("Fasting + eating must total 24 hours.");
  }

  // normalize start to HH:MM
  const start = input.eating_start.trim();
  if (!/^\d{1,2}:\d{2}$/.test(start)) {
    throw new Error('Start time must be in "HH:MM" format.');
  }

  const upd = await supabase
    .schema("disciplined")
    .from("fasting_settings")
    .update({ eating_start: start, eating_hours })
    .eq("user_id", uid);

  if (upd.error) throw upd.error;
}