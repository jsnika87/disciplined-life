// src/lib/trainV2Data.ts
import { supabase } from "@/lib/supabaseClient";
import type { TrainBodyMetrics, TrainDay, TrainSession, TrainSessionType } from "./trainV2";

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const uid = data.user?.id;
  if (!uid) throw new Error("Not logged in.");
  return uid;
}

// ---------------------------
// Train Day
// ---------------------------
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

// ---------------------------
// Sessions
// ---------------------------
export async function listSessions(dayId: string): Promise<TrainSession[]> {
  const res = await supabase
    .schema("disciplined")
    .from("train_sessions")
    .select("*")
    .eq("day_id", dayId)
    .order("created_at", { ascending: true });

  if (res.error) throw res.error;
  return (res.data ?? []) as TrainSession[];
}

export async function createSession(dayId: string, session_type: TrainSessionType): Promise<TrainSession> {
  const res = await supabase
    .schema("disciplined")
    .from("train_sessions")
    .insert({
      day_id: dayId,
      session_type,
      title: null,
      notes: null,
      duration_sec: null,
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
  const res = await supabase.schema("disciplined").from("train_sessions").update(patch).eq("id", sessionId);
  if (res.error) throw res.error;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const res = await supabase.schema("disciplined").from("train_sessions").delete().eq("id", sessionId);
  if (res.error) throw res.error;
}

// ---------------------------
// Body Metrics (weight/waist)
// ---------------------------
export async function getBodyMetrics(localDate: string): Promise<TrainBodyMetrics | null> {
  const uid = await requireUserId();

  const res = await supabase
    .schema("disciplined")
    .from("train_body_metrics")
    .select("*")
    .eq("user_id", uid)
    .eq("local_date", localDate)
    .maybeSingle<TrainBodyMetrics>();

  if (res.error) throw res.error;
  return res.data ?? null;
}

export async function upsertBodyMetrics(
  localDate: string,
  patch: { weight_lbs: number | null; waist_in: number | null }
): Promise<void> {
  const uid = await requireUserId();

  const res = await supabase
    .schema("disciplined")
    .from("train_body_metrics")
    .upsert(
      {
        user_id: uid,
        local_date: localDate,
        ...patch,
      },
      { onConflict: "user_id,local_date" }
    );

  if (res.error) throw res.error;
}