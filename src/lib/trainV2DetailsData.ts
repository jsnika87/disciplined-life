// src/lib/trainV2DetailsData.ts

import { supabase } from "@/lib/supabaseClient";
import type { TrainExercise, TrainSet, TrainWalkDetails } from "@/lib/trainV2";

export async function listExercises(sessionId: string): Promise<TrainExercise[]> {
  const res = await supabase
    .schema("disciplined")
    .from("train_exercises")
    .select("*")
    .eq("session_id", sessionId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (res.error) throw res.error;
  return (res.data ?? []) as TrainExercise[];
}

export async function createExercise(sessionId: string, name: string, sort_order = 0): Promise<TrainExercise> {
  const res = await supabase
    .schema("disciplined")
    .from("train_exercises")
    .insert({ session_id: sessionId, name, sort_order })
    .select("*")
    .single();

  if (res.error) throw res.error;
  return res.data as TrainExercise;
}

export async function updateExercise(id: string, patch: Partial<Pick<TrainExercise, "name" | "sort_order">>) {
  const res = await supabase.schema("disciplined").from("train_exercises").update(patch).eq("id", id);
  if (res.error) throw res.error;
}

export async function deleteExercise(id: string) {
  const res = await supabase.schema("disciplined").from("train_exercises").delete().eq("id", id);
  if (res.error) throw res.error;
}

// ---- Sets ----

export async function listSets(exerciseId: string): Promise<TrainSet[]> {
  const res = await supabase
    .schema("disciplined")
    .from("train_sets")
    .select("*")
    .eq("exercise_id", exerciseId)
    .order("set_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (res.error) throw res.error;
  return (res.data ?? []) as TrainSet[];
}

export async function createSet(exerciseId: string, set_index: number): Promise<TrainSet> {
  const res = await supabase
    .schema("disciplined")
    .from("train_sets")
    .insert({ exercise_id: exerciseId, set_index })
    .select("*")
    .single();

  if (res.error) throw res.error;
  return res.data as TrainSet;
}

export async function updateSet(
  id: string,
  patch: Partial<Pick<TrainSet, "set_index" | "reps" | "weight_lbs" | "notes">>
) {
  const res = await supabase.schema("disciplined").from("train_sets").update(patch).eq("id", id);
  if (res.error) throw res.error;
}

export async function deleteSet(id: string) {
  const res = await supabase.schema("disciplined").from("train_sets").delete().eq("id", id);
  if (res.error) throw res.error;
}

// ---- Walk details ----

export async function getWalkDetails(sessionId: string): Promise<TrainWalkDetails | null> {
  const res = await supabase
    .schema("disciplined")
    .from("train_walk_details")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (res.error) throw res.error;
  return (res.data ?? null) as TrainWalkDetails | null;
}

export async function upsertWalkDetails(sessionId: string, patch: { distance_miles: number | null; steps: number | null }) {
  const res = await supabase
    .schema("disciplined")
    .from("train_walk_details")
    .upsert({ session_id: sessionId, ...patch }, { onConflict: "session_id" });

  if (res.error) throw res.error;
}