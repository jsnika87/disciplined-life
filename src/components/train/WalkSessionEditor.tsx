// src/components/train/WalkSessionEditor.tsx
"use client";

import { useEffect, useState } from "react";
import { getWalkDetails, upsertWalkDetails } from "@/lib/trainV2DetailsData";

type Props = {
  sessionId: string;
  durationSec: number | null;
  onChangeDurationSec: (sec: number | null) => void;
};

export default function WalkSessionEditor({ sessionId, durationSec, onChangeDurationSec }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [distance, setDistance] = useState<string>("");
  const [steps, setSteps] = useState<string>("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const d = await getWalkDetails(sessionId);
      setDistance(d?.distance_miles != null ? String(d.distance_miles) : "");
      setSteps(d?.steps != null ? String(d.steps) : "");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function save() {
    setError(null);
    try {
      const dist = distance.trim() === "" ? null : Number(distance);
      const st = steps.trim() === "" ? null : Number(steps);

      if (dist != null && !Number.isFinite(dist)) throw new Error("Distance must be a number.");
      if (st != null && !Number.isFinite(st)) throw new Error("Steps must be a number.");

      await upsertWalkDetails(sessionId, { distance_miles: dist, steps: st });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  if (loading) return <div className="text-sm opacity-70">Loading walk details…</div>;

  return (
    <div className="space-y-2">
      {error ? <div className="rounded-lg border p-2 text-sm text-red-600">Error: {error}</div> : null}

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <div className="text-xs opacity-70">Distance (miles)</div>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            inputMode="decimal"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            placeholder="2.5"
          />
        </label>

        <label className="space-y-1">
          <div className="text-xs opacity-70">Steps</div>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            inputMode="numeric"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            placeholder="4500"
          />
        </label>
      </div>

      <label className="space-y-1 block">
        <div className="text-xs opacity-70">Duration (minutes)</div>
        <input
          className="w-full rounded-lg border px-3 py-2 text-sm"
          inputMode="numeric"
          value={durationSec != null ? String(Math.round(durationSec / 60)) : ""}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (v === "") onChangeDurationSec(null);
            else onChangeDurationSec(Math.max(0, Math.round(Number(v) * 60)));
          }}
          placeholder="30"
        />
      </label>

      <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={save}>
        Save walk details
      </button>
    </div>
  );
}