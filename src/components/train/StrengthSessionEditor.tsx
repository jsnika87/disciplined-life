"use client";

import { useEffect, useMemo, useState } from "react";
import type { TrainSession } from "@/lib/trainV2";
import {
  listExercises,
  addExercise,
  deleteExercise,
  listSets,
  addSet,
  updateSet,
  deleteSet,
} from "@/lib/trainV2DetailsData";

type ExRow = { id: string; name: string; notes: string | null; sort_order: number };
type SetRow = { id: string; reps: number | null; weight_lbs: number | null; notes: string | null; sort_order: number };

export default function StrengthSessionEditor(props: {
  session: TrainSession;
  onSaveSession: (patch: Partial<Pick<TrainSession, "title" | "notes" | "duration_sec">>) => Promise<void>;
  onSaved: () => void;
}) {
  const s = props.session;

  const [title, setTitle] = useState(s.title ?? "");
  const [notes, setNotes] = useState(s.notes ?? "");
  const [durationMin, setDurationMin] = useState(s.duration_sec != null ? String(Math.round(s.duration_sec / 60)) : "");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [exercises, setExercises] = useState<ExRow[]>([]);
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetRow[]>>({});
  const [newExerciseName, setNewExerciseName] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const ex = await listExercises(s.id);
        if (cancelled) return;
        setExercises(ex);

        const map: Record<string, SetRow[]> = {};
        for (const e of ex) {
          map[e.id] = await listSets(e.id);
        }
        if (cancelled) return;
        setSetsByExercise(map);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [s.id]);

  const totalSets = useMemo(() => {
    return Object.values(setsByExercise).reduce((acc, arr) => acc + (arr?.length ?? 0), 0);
  }, [setsByExercise]);

  async function saveTop() {
    setErr(null);
    try {
      const min = durationMin.trim() === "" ? null : Number(durationMin);
      if (min != null && (!Number.isFinite(min) || min < 0)) throw new Error("Duration must be a positive number.");

      await props.onSaveSession({
        title: title.trim() === "" ? null : title,
        notes: notes.trim() === "" ? null : notes,
        duration_sec: min == null ? null : Math.max(0, Math.round(min * 60)),
      });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  async function onAddExercise() {
    setErr(null);
    const name = newExerciseName.trim();
    if (!name) return;

    try {
      const created = await addExercise(s.id, name);
      setExercises((prev) => [...prev, created]);
      setSetsByExercise((prev) => ({ ...prev, [created.id]: [] }));
      setNewExerciseName("");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  async function onDeleteExercise(exerciseId: string) {
    setErr(null);
    try {
      await deleteExercise(exerciseId);
      setExercises((prev) => prev.filter((x) => x.id !== exerciseId));
      setSetsByExercise((prev) => {
        const next = { ...prev };
        delete next[exerciseId];
        return next;
      });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  async function onAddSet(exerciseId: string) {
    setErr(null);
    try {
      const created = await addSet(exerciseId);
      setSetsByExercise((prev) => ({ ...prev, [exerciseId]: [...(prev[exerciseId] ?? []), created] }));
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  async function onUpdateSet(exerciseId: string, setId: string, patch: Partial<Pick<SetRow, "reps" | "weight_lbs" | "notes">>) {
    setErr(null);
    try {
      await updateSet(setId, patch);
      setSetsByExercise((prev) => ({
        ...prev,
        [exerciseId]: (prev[exerciseId] ?? []).map((r) => (r.id === setId ? { ...r, ...patch } : r)),
      }));
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  async function onDeleteSet(exerciseId: string, setId: string) {
    setErr(null);
    try {
      await deleteSet(setId);
      setSetsByExercise((prev) => ({ ...prev, [exerciseId]: (prev[exerciseId] ?? []).filter((r) => r.id !== setId) }));
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  async function saveAndClose() {
    await saveTop();
    props.onSaved();
  }

  if (loading) return <div className="text-sm opacity-70">Loading workout details…</div>;

  return (
    <div className="space-y-4">
      {err ? <div className="rounded-lg border p-2 text-sm text-red-600">Error: {err}</div> : null}

      <div className="grid gap-3">
        <label className="space-y-1 block">
          <div className="text-xs opacity-70">Title</div>
          <input className="w-full rounded-lg border px-3 py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Evening workout" />
        </label>

        <label className="space-y-1 block">
          <div className="text-xs opacity-70">Duration (minutes)</div>
          <input className="w-full rounded-lg border px-3 py-2 text-sm" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} inputMode="numeric" placeholder="45" />
        </label>

        <label className="space-y-1 block">
          <div className="text-xs opacity-70">Notes</div>
          <textarea className="w-full rounded-lg border px-3 py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes…" />
        </label>

        <div className="text-xs opacity-70">Exercises: {exercises.length} • Sets: {totalSets}</div>
      </div>

      <div className="rounded-xl border p-3 space-y-3">
        <div className="font-semibold">Exercises</div>

        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border px-3 py-2 text-sm"
            value={newExerciseName}
            onChange={(e) => setNewExerciseName(e.target.value)}
            placeholder="Add exercise (e.g., Bench Press)"
          />
          <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={onAddExercise}>
            Add
          </button>
        </div>

        {exercises.length === 0 ? (
          <div className="text-sm opacity-70">No exercises yet. Add one above.</div>
        ) : (
          <div className="space-y-3">
            {exercises.map((ex) => (
              <div key={ex.id} className="rounded-xl border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">{ex.name}</div>
                  <button className="rounded-lg border px-2 py-1 text-xs hover:bg-muted" type="button" onClick={() => onDeleteExercise(ex.id)}>
                    Delete
                  </button>
                </div>

                <div className="space-y-2">
                  {(setsByExercise[ex.id] ?? []).map((st) => (
                    <div key={st.id} className="rounded-lg border p-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1">
                          <div className="text-xs opacity-70">Reps</div>
                          <input
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                            inputMode="numeric"
                            value={st.reps != null ? String(st.reps) : ""}
                            onChange={(e) => {
                              const v = e.target.value.trim();
                              const reps = v === "" ? null : Number(v);
                              onUpdateSet(ex.id, st.id, { reps: reps == null ? null : Math.max(0, Math.round(reps)) });
                            }}
                            placeholder="10"
                          />
                        </label>

                        <label className="space-y-1">
                          <div className="text-xs opacity-70">Weight (lbs)</div>
                          <input
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                            inputMode="decimal"
                            value={st.weight_lbs != null ? String(st.weight_lbs) : ""}
                            onChange={(e) => {
                              const v = e.target.value.trim();
                              const w = v === "" ? null : Number(v);
                              onUpdateSet(ex.id, st.id, { weight_lbs: w == null ? null : w });
                            }}
                            placeholder="135"
                          />
                        </label>
                      </div>

                      <label className="space-y-1 block">
                        <div className="text-xs opacity-70">Notes</div>
                        <input
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          value={st.notes ?? ""}
                          onChange={(e) => onUpdateSet(ex.id, st.id, { notes: e.target.value })}
                          placeholder="Optional (RPE, tempo, etc.)"
                        />
                      </label>

                      <button className="rounded-lg border px-2 py-1 text-xs hover:bg-muted" type="button" onClick={() => onDeleteSet(ex.id, st.id)}>
                        Remove set
                      </button>
                    </div>
                  ))}
                </div>

                <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={() => onAddSet(ex.id)}>
                  + Add set
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={saveAndClose}>
          Save & close
        </button>
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={props.onSaved}>
          Cancel
        </button>
      </div>
    </div>
  );
}