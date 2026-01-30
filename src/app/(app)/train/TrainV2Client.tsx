// src/app/(app)/train/TrainV2Client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import TimerPanel from "@/components/train/TimerPanel";
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
import { markPillarComplete } from "@/lib/pillarsClient";

function todayLocalISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function TrainV2Client() {
  const localDate = useMemo(() => todayLocalISO(), []);
  const [loading, setLoading] = useState(true);
  const [dayId, setDayId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<TrainSession[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [weight, setWeight] = useState<string>("");
  const [waist, setWaist] = useState<string>("");
  const [metricsSavedAt, setMetricsSavedAt] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const day = await getOrCreateTrainDay(localDate);
      setDayId(day.id);

      const sess = await listSessions(day.id);
      setSessions(sess);

      const m = await getBodyMetrics(localDate);
      setWeight(m?.weight_lbs != null ? String(m.weight_lbs) : "");
      setWaist(m?.waist_in != null ? String(m.waist_in) : "");
      setMetricsSavedAt(m?.updated_at ?? null);
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

      // ✅ V1 pillar completion (Train) when any session is added
      // We don't block the UI if this fails; we’ll show an error if it does.
      try {
        await markPillarComplete(localDate, "train");
      } catch (pillarErr: any) {
        setError(pillarErr?.message ?? String(pillarErr));
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  async function onUpdateSession(id: string, patch: Partial<Pick<TrainSession, "title" | "notes" | "duration_sec">>) {
    setError(null);
    try {
      await updateSession(id, patch);
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  async function onDeleteSession(id: string) {
    setError(null);
    try {
      await deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  async function saveMetrics() {
    setError(null);
    try {
      const w = weight.trim() === "" ? null : Number(weight);
      const ws = waist.trim() === "" ? null : Number(waist);

      if (w != null && !Number.isFinite(w)) throw new Error("Weight must be a number.");
      if (ws != null && !Number.isFinite(ws)) throw new Error("Waist must be a number.");

      await upsertBodyMetrics(localDate, { weight_lbs: w, waist_in: ws });
      setMetricsSavedAt(new Date().toISOString());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-sm opacity-70">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">Train</div>
          <div className="text-sm opacity-70">Multiple sessions per day • Sets/Reps/Weight • Walk distance/steps • Timers • Weight/Waist</div>
        </div>
        <div className="text-sm opacity-70">Today: {localDate}</div>
      </div>

      {error ? <div className="rounded-xl border p-3 text-sm text-red-600">Error: {error}</div> : null}

      <TimerPanel />

      <section className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Body metrics</div>
          <div className="text-xs opacity-70">{metricsSavedAt ? "Saved" : "Not saved yet"}</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-xs opacity-70">Weight (lbs)</div>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              inputMode="decimal"
              placeholder="250"
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs opacity-70">Waist (in)</div>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={waist}
              onChange={(e) => setWaist(e.target.value)}
              inputMode="decimal"
              placeholder="42"
            />
          </label>
        </div>

        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={saveMetrics}>
          Save metrics
        </button>
      </section>

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

        {sessions.length === 0 ? (
          <div className="text-sm opacity-70">No sessions yet. Add a walk or workout.</div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div key={s.id} className="rounded-xl border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm opacity-70">
                    {s.session_type === "strength"
                      ? "Workout"
                      : s.session_type === "conditioning"
                      ? "Conditioning"
                      : s.session_type === "walk"
                      ? "Walk"
                      : "Session"}
                  </div>
                  <button className="rounded-lg border px-2 py-1 text-xs hover:bg-muted" type="button" onClick={() => onDeleteSession(s.id)}>
                    Delete
                  </button>
                </div>

                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={s.title ?? ""}
                  onChange={(e) => onUpdateSession(s.id, { title: e.target.value })}
                  placeholder="Title (optional)"
                />

                {s.session_type === "conditioning" ? (
                  <label className="space-y-1 block">
                    <div className="text-xs opacity-70">Duration (minutes)</div>
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      inputMode="numeric"
                      value={s.duration_sec != null ? String(Math.round(s.duration_sec / 60)) : ""}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        const min = v === "" ? null : Number(v);
                        if (min == null) onUpdateSession(s.id, { duration_sec: null });
                        else onUpdateSession(s.id, { duration_sec: Math.max(0, Math.round(min * 60)) });
                      }}
                      placeholder="20"
                    />
                  </label>
                ) : (
                  <div className="text-xs opacity-70">Use the session editor below to log details.</div>
                )}

                <textarea
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={s.notes ?? ""}
                  onChange={(e) => onUpdateSession(s.id, { notes: e.target.value })}
                  placeholder="Notes (optional)"
                  rows={2}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}