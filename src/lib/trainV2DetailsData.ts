import { supabase } from "@/lib/supabaseClient";

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("Not logged in.");
  return uid;
}

/** ---------------------------
 * Walk details
 * --------------------------*/

export type WalkDetails = {
  id: string;
  user_id: string;
  session_id: string;
  steps: number | null;
  distance_mi: number | null;
  created_at: string;
  updated_at: string;
};

export async function getOrCreateWalkDetails(sessionId: string): Promise<WalkDetails> {
  const uid = await requireUserId();

  const existing = await supabase
    .schema("disciplined")
    .from("train_walk_details")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle<WalkDetails>();

  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const created = await supabase
    .schema("disciplined")
    .from("train_walk_details")
    .insert({ user_id: uid, session_id: sessionId, steps: null, distance_mi: null })
    .select("*")
    .single<WalkDetails>();

  if (created.error) throw created.error;
  return created.data;
}

export async function updateWalkDetails(sessionId: string, patch: { steps?: number | null; distance_mi?: number | null }) {
  const uid = await requireUserId();

  const upd = await supabase
    .schema("disciplined")
    .from("train_walk_details")
    .update({ ...patch })
    .eq("session_id", sessionId)
    .eq("user_id", uid);

  if (upd.error) throw upd.error;
}

/** ---------------------------
 * Strength: exercises + sets
 * --------------------------*/

export type TrainExerciseRow = {
  id: string;
  user_id: string;
  session_id: string;
  name: string;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TrainSetRow = {
  id: string;
  user_id: string;
  exercise_id: string;
  sort_order: number;
  reps: number | null;
  weight_lbs: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function listExercises(sessionId: string): Promise<TrainExerciseRow[]> {
  const uid = await requireUserId();
  const res = await supabase
    .schema("disciplined")
    .from("train_exercises")
    .select("*")
    .eq("session_id", sessionId)
    .eq("user_id", uid)
    .order("sort_order", { ascending: true });

  if (res.error) throw res.error;
  return res.data ?? [];
}

export async function addExercise(sessionId: string, name: string): Promise<TrainExerciseRow> {
  const uid = await requireUserId();

  const current = await listExercises(sessionId);
  const sort_order = current.length;

  const created = await supabase
    .schema("disciplined")
    .from("train_exercises")
    .insert({ user_id: uid, session_id: sessionId, name, sort_order })
    .select("*")
    .single<TrainExerciseRow>();

  if (created.error) throw created.error;
  return created.data;
}

export async function deleteExercise(exerciseId: string) {
  const uid = await requireUserId();
  const res = await supabase
    .schema("disciplined")
    .from("train_exercises")
    .delete()
    .eq("id", exerciseId)
    .eq("user_id", uid);

  if (res.error) throw res.error;
}

export async function listSets(exerciseId: string): Promise<TrainSetRow[]> {
  const uid = await requireUserId();
  const res = await supabase
    .schema("disciplined")
    .from("train_sets")
    .select("*")
    .eq("exercise_id", exerciseId)
    .eq("user_id", uid)
    .order("sort_order", { ascending: true });

  if (res.error) throw res.error;
  return res.data ?? [];
}

export async function addSet(exerciseId: string): Promise<TrainSetRow> {
  const uid = await requireUserId();

  const current = await listSets(exerciseId);
  const sort_order = current.length;

  const created = await supabase
    .schema("disciplined")
    .from("train_sets")
    .insert({ user_id: uid, exercise_id: exerciseId, sort_order, reps: null, weight_lbs: null, notes: null })
    .select("*")
    .single<TrainSetRow>();

  if (created.error) throw created.error;
  return created.data;
}

export async function updateSet(setId: string, patch: Partial<Pick<TrainSetRow, "reps" | "weight_lbs" | "notes">>) {
  const uid = await requireUserId();
  const res = await supabase
    .schema("disciplined")
    .from("train_sets")
    .update({ ...patch })
    .eq("id", setId)
    .eq("user_id", uid);

  if (res.error) throw res.error;
}

export async function deleteSet(setId: string) {
  const uid = await requireUserId();
  const res = await supabase
    .schema("disciplined")
    .from("train_sets")
    .delete()
    .eq("id", setId)
    .eq("user_id", uid);

  if (res.error) throw res.error;
}