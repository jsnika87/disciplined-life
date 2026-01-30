// src/lib/trainV2Data.ts
import { supabase } from "@/lib/supabaseClient";
import type { BodyMetrics, TrainDay, TrainSession, TrainSessionType } from "./trainV2";

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const uid = data.user?.id;
  if (!uid) throw new Error("Not logged in.");
  return uid;
}

/**
 * TRAIN DAY
 * Ensures there is a train_days row for this user + local date.
 * IMPORTANT: inserts MUST include user_id to satisfy RLS.
 */
export async function getOrCreateTrainDay(localDate: string): Promise<TrainDay> {
  const uid = await requireUserId();

  const existing = await supabase
    .schema("disciplined")
    .from("train_days")
    .select("*")
    .eq("user_id", uid)
    .eq("local_date", localDate)
    .maybeSingle<TrainDay>();

  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const created = await supabase
    .schema("disciplined")
    .from("train_days")
    .insert({ user_id: uid, local_date: localDate })
    .select("*")
    .single<TrainDay>();

  if (created.error) throw created.error;
  return created.data;
}

/**
 * SESSIONS
 */
export async function listSessions(dayId: string): Promise<TrainSession[]> {
  const uid = await requireUserId();

  const res = await supabase
    .schema("disciplined")
    .from("train_sessions")
    .select("*")
    .eq("user_id", uid)
    .eq("day_id", dayId)
    .order("created_at", { ascending: true });

  if (res.error) throw res.error;
  return (res.data ?? []) as TrainSession[];
}

export async function createSession(dayId: string, sessionType: TrainSessionType): Promise<TrainSession> {
  const uid = await requireUserId();

  // IMPORTANT: include user_id so RLS WITH CHECK passes
  const res = await supabase
    .schema("disciplined")
    .from("train_sessions")
    .insert({
      user_id: uid,
      day_id: dayId,
      session_type: sessionType,
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single<TrainSession>();

  if (res.error) throw res.error;
  return res.data;
}

export async function updateSession(
  sessionId: string,
  patch: Partial<Pick<TrainSession, "title" | "notes" | "duration_sec">>
): Promise<void> {
  const uid = await requireUserId();

  const res = await supabase
    .schema("disciplined")
    .from("train_sessions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", uid);

  if (res.error) throw res.error;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const uid = await requireUserId();

  const res = await supabase
    .schema("disciplined")
    .from("train_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", uid);

  if (res.error) throw res.error;
}

/**
 * BODY METRICS
 * One row per user per local_date.
 */
export async function getBodyMetrics(localDate: string): Promise<BodyMetrics | null> {
  const uid = await requireUserId();

  const res = await supabase
    .schema("disciplined")
    .from("train_body_metrics")
    .select("*")
    .eq("user_id", uid)
    .eq("local_date", localDate)
    .maybeSingle<BodyMetrics>();

  if (res.error) throw res.error;
  return res.data ?? null;
}

export async function upsertBodyMetrics(
  localDate: string,
  input: { weight_lbs: number | null; waist_in: number | null }
): Promise<void> {
  const uid = await requireUserId();

  const res = await supabase
    .schema("disciplined")
    .from("train_body_metrics")
    .upsert(
      {
        user_id: uid,
        local_date: localDate,
        weight_lbs: input.weight_lbs,
        waist_in: input.waist_in,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,local_date" }
    );

  if (res.error) throw res.error;
}