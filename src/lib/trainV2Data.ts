// src/lib/trainV2Data.ts
import { supabase } from "@/lib/supabaseClient";
import type { BodyMetrics, TrainDay, TrainExercise, TrainSession, TrainSessionType, TrainSet } from "./trainV2";

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("Not logged in.");
  return uid;
}

export async function getOrCreateTrainDay(localDate: string): Promise<TrainDay> {
  const uid = await requireUserId();

  const existing = await supabase
    .schema("disciplined")
    .from("train_days")
    .select("id,user_id,local_date")
    .eq("user_id", uid)
    .eq("local_date", localDate)
    .maybeSingle<TrainDay>();

  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const created = await supabase
    .schema("disciplined")
    .from("train_days")
    .insert({ user_id: uid, local_date: localDate })
    .select("id,user_id,local_date")
    .single<TrainDay>();

  if (created.error) throw created.error;
  return created.data;
}

export async function listSessions(dayId: string): Promise<TrainSession[]> {
  const uid = await requireUserId();
  const res = await supabase
    .schema("disciplined")
    .from("train_sessions")
    .select("id,day_id,user_id,session_type,title,notes,duration_sec,created_at,updated_at")
    .eq("user_id", uid)
    .eq("day_id", dayId)
    .order("created_at", { ascending: true });

  if (res.error) throw res.error;
  return (res.data ?? []) as TrainSession[];
}

export async function createSession(dayId: string, type: TrainSessionType): Promise<TrainSession> {
  const uid = await requireUserId();
  const title =
    type === "strength" ? "Workout" : type === "conditioning" ? "Conditioning" : type === "walk" ? "Walk" : "Session";

  const res = await supabase
    .schema("disciplined")
    .from("train_sessions")
    .insert({ user_id: uid, day_id: dayId, session_type: type, title })
    .select("id,day_id,user_id,session_type,title,notes,duration_sec,created_at,updated_at")
    .single<TrainSession>();

  if (res.error) throw res.error;
  return res.data;
}

export async function updateSession(sessionId: string, patch: Partial<Pick<TrainSession, "title" | "notes" | "duration_sec">>) {
  const uid = await requireUserId();
  const res = await supabase
    .schema("disciplined")
    .from("train_sessions")
    .update(patch)
    .eq("user_id", uid)
    .eq("id", sessionId);

  if (res.error) throw res.error;
}

export async function deleteSession(sessionId: string) {
  const uid = await requireUserId();
  const res = await supabase.schema("disciplined").from("train_sessions").delete().eq("user_id", uid).eq("id", sessionId);
  if (res.error) throw res.error;
}

export async function listExercises(sessionId: string): Promise<TrainExercise[]> {
  const uid = await requireUserId();
  const res = await supabase
    .schema("disciplined")
    .from("train_exercises")
    .select("id,session_id,user_id,name,sort_order")
    .eq("user_id", uid)
    .eq("session_id", sessionId)
    .order("sort_order", { ascending: true });

  if (res.error) throw res.error;
  return (res.data ?? []) as TrainExercise[];
}

export async function addExercise(sessionId: string, name: string): Promise<TrainExercise> {
  const uid = await requireUserId();

  // find next sort order
  const last = await supabase
    .schema("disciplined")
    .from("train_exercises")
    .select("sort_order")
    .eq("user_id", uid)
    .eq("session_id", sessionId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextSort = (last.data?.[0]?.sort_order ?? 0) + 1;

  const res = await supabase
    .schema("disciplined")
    .from("train_exercises")
    .insert({ user_id: uid, session_id: sessionId, name: name.trim(), sort_order: nextSort })
    .select("id,session_id,user_id,name,sort_order")
    .single<TrainExercise>();

  if (res.error) throw res.error;
  return res.data;
}

export async function renameExercise(exerciseId: string, name: string) {
  const uid = await requireUserId();
  const res = await supabase.schema("disciplined").from("train_exercises").update({ name }).eq("user_id", uid).eq("id", exerciseId);
  if (res.error) throw res.error;
}

export async function deleteExercise(exerciseId: string) {
  const uid = await requireUserId();
  const res = await supabase.schema("disciplined").from("train_exercises").delete().eq("user_id", uid).eq("id", exerciseId);
  if (res.error) throw res.error;
}

export async function listSets(exerciseId: string): Promise<TrainSet[]> {
  const uid = await requireUserId();
  const res = await supabase
    .schema("disciplined")
    .from("train_sets")
    .select("id,exercise_id,user_id,set_index,reps,weight_lbs,completed")
    .eq("user_id", uid)
    .eq("exercise_id", exerciseId)
    .order("set_index", { ascending: true });

  if (res.error) throw res.error;
  return (res.data ?? []) as TrainSet[];
}

export async function addSet(exerciseId: string): Promise<TrainSet> {
  const uid = await requireUserId();

  const last = await supabase
    .schema("disciplined")
    .from("train_sets")
    .select("set_index")
    .eq("user_id", uid)
    .eq("exercise_id", exerciseId)
    .order("set_index", { ascending: false })
    .limit(1);

  const nextIndex = (last.data?.[0]?.set_index ?? 0) + 1;

  const res = await supabase
    .schema("disciplined")
    .from("train_sets")
    .insert({ user_id: uid, exercise_id: exerciseId, set_index: nextIndex, completed: false })
    .select("id,exercise_id,user_id,set_index,reps,weight_lbs,completed")
    .single<TrainSet>();

  if (res.error) throw res.error;
  return res.data;
}

export async function updateSet(setId: string, patch: Partial<Pick<TrainSet, "reps" | "weight_lbs" | "completed">>) {
  const uid = await requireUserId();
  const res = await supabase.schema("disciplined").from("train_sets").update(patch).eq("user_id", uid).eq("id", setId);
  if (res.error) throw res.error;
}

export async function deleteSet(setId: string) {
  const uid = await requireUserId();
  const res = await supabase.schema("disciplined").from("train_sets").delete().eq("user_id", uid).eq("id", setId);
  if (res.error) throw res.error;
}

export async function upsertBodyMetrics(localDate: string, input: { weight_lbs?: number | null; waist_in?: number | null; notes?: string | null }) {
  const uid = await requireUserId();
  const res = await supabase
    .schema("disciplined")
    .from("body_metrics")
    .upsert(
      { user_id: uid, local_date: localDate, weight_lbs: input.weight_lbs ?? null, waist_in: input.waist_in ?? null, notes: input.notes ?? null },
      { onConflict: "user_id,local_date" }
    );

  if (res.error) throw res.error;
}

export async function getBodyMetrics(localDate: string): Promise<BodyMetrics | null> {
  const uid = await requireUserId();
  const res = await supabase
    .schema("disciplined")
    .from("body_metrics")
    .select("id,user_id,local_date,weight_lbs,waist_in,notes,updated_at")
    .eq("user_id", uid)
    .eq("local_date", localDate)
    .maybeSingle<BodyMetrics>();

  if (res.error) throw res.error;
  return res.data ?? null;
}