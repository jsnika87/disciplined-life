// src/lib/trainV2.ts
export type TrainSessionType = "strength" | "conditioning" | "walk" | "other";

export type TrainDay = {
  id: string;
  user_id: string;
  local_date: string; // YYYY-MM-DD
};

export type TrainSession = {
  id: string;
  day_id: string;
  user_id: string;
  session_type: TrainSessionType;
  title: string | null;
  notes: string | null;
  duration_sec: number | null;
  created_at: string;
  updated_at: string;
};

export type TrainExercise = {
  id: string;
  session_id: string;
  user_id: string;
  name: string;
  sort_order: number;
};

export type TrainSet = {
  id: string;
  exercise_id: string;
  user_id: string;
  set_index: number;
  reps: number | null;
  weight_lbs: number | null;
  completed: boolean;
};

export type BodyMetrics = {
  id: string;
  user_id: string;
  local_date: string;
  weight_lbs: number | null;
  waist_in: number | null;
  notes: string | null;
  updated_at: string;
};