// src/lib/pillarStats.ts
import { supabase } from "@/lib/supabaseClient";

export type PillarKey = "train" | "eat" | "word" | "freedom";

function isoUTC(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDaysUTC(iso: string, deltaDays: number) {
  // iso = YYYY-MM-DD, interpret as UTC midnight
  const [y, m, dd] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, dd));
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return isoUTC(d);
}

async function getUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const uid = data.user?.id;
  if (!uid) throw new Error("Not logged in.");
  return uid;
}

/**
 * Returns an array for a date range (inclusive), with completion status per day.
 * Missing daily_entries are treated as not completed.
 */
export async function fetchPillarDailyCompletion(
  pillar: PillarKey,
  startISO: string,
  endISO: string
): Promise<{ date: string; completed: boolean }[]> {
  const uid = await getUserId();

  // 1) fetch daily_entries for range
  const entriesRes = await supabase
    .schema("disciplined")
    .from("daily_entries")
    .select("id,entry_date")
    .eq("user_id", uid)
    .gte("entry_date", startISO)
    .lte("entry_date", endISO)
    .order("entry_date", { ascending: true });

  if (entriesRes.error) throw entriesRes.error;

  const entries = (entriesRes.data ?? []) as { id: string; entry_date: string }[];
  const entryIds = entries.map((e) => e.id);

  // map entry_date by id
  const dateByEntryId = new Map<string, string>();
  for (const e of entries) dateByEntryId.set(e.id, e.entry_date);

  // 2) fetch pillar rows for those entries
  const completedByDate = new Map<string, boolean>();

  if (entryIds.length > 0) {
    const pillarsRes = await supabase
      .schema("disciplined")
      .from("daily_pillars")
      .select("entry_id,completed")
      .in("entry_id", entryIds)
      .eq("pillar", pillar);

    if (pillarsRes.error) throw pillarsRes.error;

    for (const row of (pillarsRes.data ?? []) as { entry_id: string; completed: boolean }[]) {
      const d = dateByEntryId.get(row.entry_id);
      if (d) completedByDate.set(d, !!row.completed);
    }
  }

  // 3) build full range array (including missing days)
  const out: { date: string; completed: boolean }[] = [];
  let cur = startISO;
  while (cur <= endISO) {
    out.push({ date: cur, completed: completedByDate.get(cur) ?? false });
    cur = addDaysUTC(cur, 1);
  }

  return out;
}

/**
 * Computes current streak up through today (UTC) from a completion list.
 * Expects list includes today.
 */
export function computeStreakFromList(list: { date: string; completed: boolean }[], todayISO: string) {
  // Build map date->completed
  const map = new Map<string, boolean>();
  for (const row of list) map.set(row.date, row.completed);

  let streak = 0;
  let cur = todayISO;

  while (true) {
    if (!map.get(cur)) break;
    streak += 1;
    cur = addDaysUTC(cur, -1);
  }

  return streak;
}

/**
 * Whether there is ANY meaningful history for this pillar.
 * (At minimum: at least one daily_pillars row exists for this pillar.)
 */
export async function hasAnyPillarHistory(pillar: PillarKey): Promise<boolean> {
  // With RLS, user can only see their own rows via daily_entries relationship policy.
  // We can just count daily_pillars rows for this pillar.
  const res = await supabase
    .schema("disciplined")
    .from("daily_pillars")
    .select("entry_id", { count: "exact", head: true })
    .eq("pillar", pillar);

  if (res.error) throw res.error;
  return (res.count ?? 0) > 0;
}

/**
 * Returns a map YYYY-MM-DD -> completed for the given month (UTC).
 */
export async function fetchMonthCompletionMap(
  pillar: PillarKey,
  year: number,
  monthIndex0: number
): Promise<Map<string, boolean>> {
  const first = new Date(Date.UTC(year, monthIndex0, 1));
  const last = new Date(Date.UTC(year, monthIndex0 + 1, 0)); // last day of month

  const startISO = isoUTC(first);
  const endISO = isoUTC(last);

  const list = await fetchPillarDailyCompletion(pillar, startISO, endISO);
  const map = new Map<string, boolean>();
  for (const r of list) map.set(r.date, r.completed);
  return map;
}

export function todayISODateUTC() {
  return new Date().toISOString().slice(0, 10);
}