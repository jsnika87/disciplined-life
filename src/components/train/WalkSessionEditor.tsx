"use client";

import { useEffect, useState } from "react";
import type { TrainSession } from "@/lib/trainV2";
import { getOrCreateWalkDetails, updateWalkDetails } from "@/lib/trainV2DetailsData";

export default function WalkSessionEditor(props: {
  session: TrainSession;
  onSaveSession: (patch: Partial<Pick<TrainSession, "title" | "notes" | "duration_sec">>) => Promise<void>;
  onSaved: () => void;
}) {
  const s = props.session;

  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<string>("");
  const [distance, setDistance] = useState<string>("");

  const [title, setTitle] = useState<string>(s.title ?? "");
  const [notes, setNotes] = useState<string>(s.notes ?? "");
  const [durationMin, setDurationMin] = useState<string>(
    s.duration_sec != null ? String(Math.round(s.duration_sec / 60)) : ""
  );

  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const d = await getOrCreateWalkDetails(s.id);
        if (cancelled) return;
        setSteps(d.steps != null ? String(d.steps) : "");
        setDistance(d.distance_mi != null ? String(d.distance_mi) : "");
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

  async function saveAll() {
    setErr(null);
    try {
      const st = steps.trim() === "" ? null : Number(steps);
      const dist = distance.trim() === "" ? null : Number(distance);

      if (st != null && (!Number.isFinite(st) || st < 0)) throw new Error("Steps must be a positive number.");
      if (dist != null && (!Number.isFinite(dist) || dist < 0)) throw new Error("Distance must be a positive number.");

      const min = durationMin.trim() === "" ? null : Number(durationMin);
      if (min != null && (!Number.isFinite(min) || min < 0)) throw new Error("Duration must be a positive number.");

      await props.onSaveSession({
        title: title.trim() === "" ? null : title,
        notes: notes.trim() === "" ? null : notes,
        duration_sec: min == null ? null : Math.max(0, Math.round(min * 60)),
      });

      await updateWalkDetails(s.id, {
        steps: st == null ? null : Math.round(st),
        distance_mi: dist == null ? null : dist,
      });

      props.onSaved(); // close editor into view mode
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  if (loading) return <div className="text-sm opacity-70">Loading walk details…</div>;

  return (
    <div className="space-y-3">
      {err ? <div className="rounded-lg border p-2 text-sm text-red-600">Error: {err}</div> : null}

      <label className="space-y-1 block">
        <div className="text-xs opacity-70">Title</div>
        <input className="w-full rounded-lg border px-3 py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Morning walk" />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 block">
          <div className="text-xs opacity-70">Steps</div>
          <input className="w-full rounded-lg border px-3 py-2 text-sm" value={steps} onChange={(e) => setSteps(e.target.value)} inputMode="numeric" placeholder="3500" />
        </label>

        <label className="space-y-1 block">
          <div className="text-xs opacity-70">Distance (mi)</div>
          <input className="w-full rounded-lg border px-3 py-2 text-sm" value={distance} onChange={(e) => setDistance(e.target.value)} inputMode="decimal" placeholder="1.8" />
        </label>
      </div>

      <label className="space-y-1 block">
        <div className="text-xs opacity-70">Duration (minutes)</div>
        <input className="w-full rounded-lg border px-3 py-2 text-sm" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} inputMode="numeric" placeholder="30" />
      </label>

      <label className="space-y-1 block">
        <div className="text-xs opacity-70">Notes</div>
        <textarea className="w-full rounded-lg border px-3 py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes…" />
      </label>

      <div className="flex gap-2">
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={saveAll}>
          Save & close
        </button>
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={props.onSaved}>
          Cancel
        </button>
      </div>
    </div>
  );
}