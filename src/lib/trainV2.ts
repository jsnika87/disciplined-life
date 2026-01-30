// src/lib/trainV2.ts

export type TrainSessionType = "walk" | "strength" | "conditioning";

export type TrainDay = {
  id: string;
  user_id: string;
  local_date: string; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
};

export type TrainSession = {
  id: string;
  day_id: string;
  session_type: TrainSessionType;
  title: string | null;
  notes: string | null;
  duration_sec: number | null;
  created_at: string;
  updated_at: string;
};

export type TrainBodyMetrics = {
  id: string;
  user_id: string;
  local_date: string;
  weight_lbs: number | null;
  waist_in: number | null;
  created_at: string;
  updated_at: string;
};

/**
 * Back-compat alias (older code used BodyMetrics)
 * Keep this until we’ve migrated all imports.
 */
export type BodyMetrics = TrainBodyMetrics;

export type TrainExercise = {
  id: string;
  session_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TrainSet = {
  id: string;
  exercise_id: string;
  set_index: number;
  reps: number | null;
  weight_lbs: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TrainWalkDetails = {
  session_id: string;
  distance_miles: number | null;
  steps: number | null;
  created_at: string;
  updated_at: string;
};