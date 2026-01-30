// src/app/(app)/train/TrainV2Client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import TimerPanel from "@/components/train/TimerPanel";
import WalkSessionEditor from "@/components/train/WalkSessionEditor";
import ConditioningSessionEditor from "@/components/train/ConditioningSessionEditor";
import StrengthSessionEditor from "@/components/train/StrengthSessionEditor";
import {
  getOrCreateTrainDay,
  listSessions,
  createSession,
  updateSession,
  deleteSession,
  getBodyMetrics,
  upsertBodyMetrics,
} from "@/lib/trainV2Data";
import type { TrainSession, TrainSessionType } from "@/lib/trainV2";

function todayLocalISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtSessionLabel(t: TrainSessionType) {
  if (t === "strength") return "Workout";
  if (t === "conditioning") return "Conditioning";
  if (t === "walk") return "Walk";
  return "Session";
}

type SessionPatch = Partial<Pick<TrainSession, "title" | "notes" | "duration_sec">>;

export default function TrainV2Client() {
  const localDate = useMemo(() => todayLocalISO(), []);
  const [loading, setLoading] = useState(true);
  const [dayId, setDayId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<TrainSession[]>([]);
  const [error, setError] = useState<string | null>(null);

  // body metrics view/edit
  const [metricsMode, setMetricsMode] = useState<"view" | "edit">("view");
  const [weightDraft, setWeightDraft] = useState<string>("");
  const [waistDraft, setWaistDraft] = useState<string>("");
  const [metricsSavedAt, setMetricsSavedAt] = useState<string | null>(null);

  // session editing
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const day = await getOrCreateTrainDay(localDate);
      setDayId(day.id);

      const sess = await listSessions(day.id);
      setSessions(sess);

      const m = await getBodyMetrics(localDate);
      setWeightDraft(m?.weight_lbs != null ? String(m.weight_lbs) : "");
      setWaistDraft(m?.waist_in != null ? String(m.waist_in) : "");
      setMetricsSavedAt(m?.updated_at ?? null);
      setMetricsMode(m ? "view" : "edit");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onAddSession(type: TrainSessionType) {
    if (!dayId) return;
    setError(null);

    try {
      const created = await createSession(dayId, type);
      setSessions((prev) => [...prev, created]);

      // After add → view mode (no editor)
      setEditingSessionId(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  async function onDeleteSession(id: string) {
    setError(null);
    try {
      await deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (editingSessionId === id) setEditingSessionId(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  async function saveMetrics() {
    setError(null);
    try {
      const w = weightDraft.trim() === "" ? null : Number(weightDraft);
      const ws = waistDraft.trim() === "" ? null : Number(waistDraft);

      if (w != null && !Number.isFinite(w)) throw new Error("Weight must be a number.");
      if (ws != null && !Number.isFinite(ws)) throw new Error("Waist must be a number.");

      await upsertBodyMetrics(localDate, { weight_lbs: w, waist_in: ws });

      setMetricsSavedAt(new Date().toISOString());
      setMetricsMode("view"); // view mode after save
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-sm opacity-70">Loading…</div>;

  const editing = sessions.find((s) => s.id === editingSessionId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <div className="text-2xl font-semibold">Train</div>
            <a
              href="/train/history"
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
            >
              History
            </a>
          </div>
          <div className="text-sm opacity-70">
            Multiple sessions per day • Sets/Reps/Weight • Walk distance/steps • Timers • Weight/Waist
          </div>
        </div>
        <div className="text-sm opacity-70">Today: {localDate}</div>
      </div>

      {error ? <div className="rounded-xl border p-3 text-sm text-red-600">Error: {error}</div> : null}

      <TimerPanel />

      {/* Body metrics */}
      <section className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Body metrics</div>
          <div className="text-xs opacity-70">{metricsSavedAt ? "Saved" : "Not saved yet"}</div>
        </div>

        {metricsMode === "view" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border p-3">
              <div className="text-xs opacity-70">Weight (lbs)</div>
              <div className="text-lg font-semibold">{weightDraft.trim() === "" ? "—" : weightDraft}</div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs opacity-70">Waist (in)</div>
              <div className="text-lg font-semibold">{waistDraft.trim() === "" ? "—" : waistDraft}</div>
            </div>

            <button
              className="col-span-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted"
              type="button"
              onClick={() => setMetricsMode("edit")}
            >
              Edit metrics
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <div className="text-xs opacity-70">Weight (lbs)</div>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={weightDraft}
                  onChange={(e) => setWeightDraft(e.target.value)}
                  inputMode="decimal"
                  placeholder="250"
                />
              </label>

              <label className="space-y-1">
                <div className="text-xs opacity-70">Waist (in)</div>
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={waistDraft}
                  onChange={(e) => setWaistDraft(e.target.value)}
                  inputMode="decimal"
                  placeholder="42"
                />
              </label>
            </div>

            <div className="flex gap-2">
              <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={saveMetrics}>
                Save metrics
              </button>
              <button
                className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                type="button"
                onClick={() => setMetricsMode(metricsSavedAt ? "view" : "edit")}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </section>

      {/* Sessions */}
      <section className="rounded-xl border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Today’s sessions</div>
          <div className="flex gap-2 flex-wrap">
            <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={() => onAddSession("walk")}>
              + Walk
            </button>
            <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={() => onAddSession("strength")}>
              + Workout
            </button>
            <button
              className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
              type="button"
              onClick={() => onAddSession("conditioning")}
            >
              + Conditioning
            </button>
          </div>
        </div>

        {/* editor */}
        {editing ? (
          <>
            {editing.session_type === "walk" ? (
              <WalkSessionEditor
                session={editing}
                onClose={() => setEditingSessionId(null)}
                onDeleted={() => onDeleteSession(editing.id)}
                onSaved={(patch: SessionPatch) => {
                  setSessions((prev) => prev.map((s) => (s.id === editing.id ? { ...s, ...patch } : s)));
                  setEditingSessionId(null);
                }}
                onError={(msg: string) => setError(msg || null)}
              />
            ) : editing.session_type === "conditioning" ? (
              <ConditioningSessionEditor
                session={editing}
                onClose={() => setEditingSessionId(null)}
                onDeleted={() => onDeleteSession(editing.id)}
                onSaved={(patch: SessionPatch) => {
                  setSessions((prev) => prev.map((s) => (s.id === editing.id ? { ...s, ...patch } : s)));
                  setEditingSessionId(null);
                }}
                onError={(msg: string) => setError(msg || null)}
              />
            ) : (
              <StrengthSessionEditor
                session={editing}
                onSaveSession={async (patch: SessionPatch) => {
                  await updateSession(editing.id, patch);
                  setSessions((prev) => prev.map((s) => (s.id === editing.id ? { ...s, ...patch } : s)));
                }}
                onSaved={() => {
                  setEditingSessionId(null);
                }}
              />
            )}
          </>
        ) : null}

        {/* list */}
        {sessions.length === 0 ? (
          <div className="text-sm opacity-70">No sessions yet. Add a walk, workout, or conditioning.</div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => {
              if (editingSessionId === s.id) return null;

              const durationMin = s.duration_sec != null ? Math.round(s.duration_sec / 60) : null;

              return (
                <div key={s.id} className="rounded-xl border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm opacity-70">{fmtSessionLabel(s.session_type)}</div>
                    <div className="flex gap-2">
                      <button
                        className="rounded-lg border px-2 py-1 text-xs hover:bg-muted"
                        type="button"
                        onClick={() => setEditingSessionId(s.id)}
                      >
                        Edit
                      </button>
                      <button
                        className="rounded-lg border px-2 py-1 text-xs hover:bg-muted"
                        type="button"
                        onClick={() => onDeleteSession(s.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="text-sm">
                    <div className="font-semibold">{s.title?.trim() ? s.title : "Untitled"}</div>
                    <div className="text-xs opacity-70">
                      {durationMin != null ? `Duration: ${durationMin} min` : s.session_type === "strength" ? "Sets/Reps" : ""}
                    </div>
                  </div>

                  {s.notes?.trim() ? <div className="text-sm opacity-80 whitespace-pre-wrap">{s.notes}</div> : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}