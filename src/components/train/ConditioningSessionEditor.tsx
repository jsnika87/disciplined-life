// src/components/train/ConditioningSessionEditor.tsx
"use client";

import { useState } from "react";
import type { TrainSession } from "@/lib/trainV2";
import { updateSession } from "@/lib/trainV2Data";

type SessionPatch = Partial<Pick<TrainSession, "title" | "notes" | "duration_sec">>;

type Props = {
  session: TrainSession;
  onClose: () => void;
  onDeleted: () => void;
  onSaved: (patch: SessionPatch) => void;
  onError: (msg: string) => void;
};

export default function ConditioningSessionEditor({ session, onClose, onDeleted, onSaved, onError }: Props) {
  const [title, setTitle] = useState(session.title ?? "");
  const [notes, setNotes] = useState(session.notes ?? "");
  const [minutes, setMinutes] = useState(session.duration_sec != null ? String(Math.round(session.duration_sec / 60)) : "");

  async function handleSave() {
    try {
      onError("");

      const min = minutes.trim() === "" ? null : Number(minutes);
      if (min != null && (!Number.isFinite(min) || min < 0)) throw new Error("Duration must be a number ≥ 0.");

      const patch: SessionPatch = {
        title: title.trim() === "" ? null : title,
        notes: notes.trim() === "" ? null : notes,
        duration_sec: min == null ? null : Math.max(0, Math.round(min * 60)),
      };

      await updateSession(session.id, patch);

      onSaved(patch);
      onClose();
    } catch (e: any) {
      onError(e?.message ?? String(e));
    }
  }

  return (
    <div className="rounded-xl border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm opacity-70">Conditioning</div>
        <div className="flex gap-2">
          <button className="rounded-lg border px-2 py-1 text-xs hover:bg-muted" type="button" onClick={handleSave}>
            Done
          </button>
          <button className="rounded-lg border px-2 py-1 text-xs hover:bg-muted" type="button" onClick={onDeleted}>
            Delete
          </button>
        </div>
      </div>

      <label className="space-y-1 block">
        <div className="text-xs opacity-70">Title (optional)</div>
        <input className="w-full rounded-lg border px-3 py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>

      <label className="space-y-1 block">
        <div className="text-xs opacity-70">Duration (minutes)</div>
        <input
          className="w-full rounded-lg border px-3 py-2 text-sm"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          inputMode="numeric"
          placeholder="20"
        />
      </label>

      <label className="space-y-1 block">
        <div className="text-xs opacity-70">Notes (optional)</div>
        <textarea
          className="w-full rounded-lg border px-3 py-2 text-sm"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes…"
          rows={3}
        />
      </label>

      <div className="flex gap-2">
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={handleSave}>
          Save & close
        </button>
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}