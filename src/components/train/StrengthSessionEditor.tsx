// src/components/train/StrengthSessionEditor.tsx
"use client";

import { useEffect, useState } from "react";
import type { TrainExercise, TrainSet } from "@/lib/trainV2";
import {
  listExercises,
  createExercise,
  updateExercise,
  deleteExercise,
  listSets,
  createSet,
  updateSet,
  deleteSet,
} from "@/lib/trainV2DetailsData";

type Props = {
  sessionId: string;
};

type ExerciseWithSets = TrainExercise & { sets: TrainSet[]; loadingSets?: boolean };

export default function StrengthSessionEditor({ sessionId }: Props) {
  const [loading, setLoading] = useState(true);
  const [savingErr, setSavingErr] = useState<string | null>(null);

  const [exName, setExName] = useState("");
  const [exercises, setExercises] = useState<ExerciseWithSets[]>([]);

  async function load() {
    setLoading(true);
    setSavingErr(null);
    try {
      const ex = await listExercises(sessionId);

      // load sets for each exercise
      const withSets: ExerciseWithSets[] = await Promise.all(
        ex.map(async (e) => {
          const sets = await listSets(e.id);
          return { ...e, sets };
        })
      );

      setExercises(withSets);
    } catch (e: any) {
      setSavingErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function addExercise() {
    const name = exName.trim();
    if (!name) return;

    setSavingErr(null);
    try {
      const created = await createExercise(sessionId, name, exercises.length);
      setExercises((prev) => [...prev, { ...created, sets: [] }]);
      setExName("");
    } catch (e: any) {
      setSavingErr(e?.message ?? String(e));
    }
  }

  async function renameExercise(exId: string, name: string) {
    setSavingErr(null);
    try {
      await updateExercise(exId, { name });
      setExercises((prev) => prev.map((e) => (e.id === exId ? { ...e, name } : e)));
    } catch (e: any) {
      setSavingErr(e?.message ?? String(e));
    }
  }

  async function removeExercise(exId: string) {
    setSavingErr(null);
    try {
      await deleteExercise(exId);
      setExercises((prev) => prev.filter((e) => e.id !== exId));
    } catch (e: any) {
      setSavingErr(e?.message ?? String(e));
    }
  }

  async function addSet(exId: string) {
    setSavingErr(null);
    try {
      const ex = exercises.find((x) => x.id === exId);
      const nextIndex = (ex?.sets?.length ?? 0) + 1;

      const created = await createSet(exId, nextIndex);
      setExercises((prev) =>
        prev.map((e) => (e.id === exId ? { ...e, sets: [...e.sets, created] } : e))
      );
    } catch (e: any) {
      setSavingErr(e?.message ?? String(e));
    }
  }

  async function patchSet(setId: string, exId: string, patch: Partial<Pick<TrainSet, "reps" | "weight_lbs" | "notes">>) {
    setSavingErr(null);
    try {
      await updateSet(setId, patch);
      setExercises((prev) =>
        prev.map((e) =>
          e.id !== exId ? e : { ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }
        )
      );
    } catch (e: any) {
      setSavingErr(e?.message ?? String(e));
    }
  }

  async function removeSet(setId: string, exId: string) {
    setSavingErr(null);
    try {
      await deleteSet(setId);
      setExercises((prev) =>
        prev.map((e) => (e.id === exId ? { ...e, sets: e.sets.filter((s) => s.id !== setId) } : e))
      );
    } catch (e: any) {
      setSavingErr(e?.message ?? String(e));
    }
  }

  if (loading) return <div className="text-sm opacity-70">Loading workout details…</div>;

  return (
    <div className="space-y-3">
      {savingErr ? <div className="rounded-lg border p-2 text-sm text-red-600">Error: {savingErr}</div> : null}

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
          value={exName}
          onChange={(e) => setExName(e.target.value)}
          placeholder="Add exercise (e.g., Bench Press)"
        />
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={addExercise}>
          Add
        </button>
      </div>

      {exercises.length === 0 ? (
        <div className="text-sm opacity-70">No exercises yet.</div>
      ) : (
        <div className="space-y-3">
          {exercises.map((ex) => (
            <div key={ex.id} className="rounded-xl border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={ex.name}
                  onChange={(e) => renameExercise(ex.id, e.target.value)}
                />
                <button
                  className="rounded-lg border px-2 py-2 text-xs hover:bg-muted"
                  type="button"
                  onClick={() => removeExercise(ex.id)}
                  title="Delete exercise"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2">
                {ex.sets.length === 0 ? (
                  <div className="text-xs opacity-70">No sets yet.</div>
                ) : (
                  ex.sets.map((s) => (
                    <div key={s.id} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-2 text-xs opacity-70">Set {s.set_index}</div>

                      <input
                        className="col-span-3 rounded-lg border px-2 py-2 text-sm"
                        inputMode="numeric"
                        placeholder="Reps"
                        value={s.reps ?? ""}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          patchSet(s.id, ex.id, { reps: v === "" ? null : Number(v) });
                        }}
                      />

                      <input
                        className="col-span-3 rounded-lg border px-2 py-2 text-sm"
                        inputMode="decimal"
                        placeholder="Weight"
                        value={s.weight_lbs ?? ""}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          patchSet(s.id, ex.id, { weight_lbs: v === "" ? null : Number(v) });
                        }}
                      />

                      <input
                        className="col-span-3 rounded-lg border px-2 py-2 text-sm"
                        placeholder="Notes"
                        value={s.notes ?? ""}
                        onChange={(e) => patchSet(s.id, ex.id, { notes: e.target.value })}
                      />

                      <button
                        className="col-span-1 rounded-lg border px-2 py-2 text-xs hover:bg-muted"
                        type="button"
                        onClick={() => removeSet(s.id, ex.id)}
                        title="Delete set"
                      >
                        🗑️
                      </button>
                    </div>
                  ))
                )}

                <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={() => addSet(ex.id)}>
                  + Add set
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}