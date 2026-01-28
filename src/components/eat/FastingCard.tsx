"use client";

import { useEffect, useMemo, useState } from "react";
import { computeFastingStatus, formatDuration, type FastingSettings } from "@/lib/fasting";
import { getOrCreateFastingSettings, updateFastingSettings } from "@/lib/fastingSettings";

const PRESETS: { label: string; eating_hours: number }[] = [
  { label: "16 / 8 (default)", eating_hours: 8 },
  { label: "18 / 6", eating_hours: 6 },
  { label: "20 / 4", eating_hours: 4 },
  { label: "14 / 10", eating_hours: 10 },
];

function formatTimeAMPM(hhmm: string) {
  // expects "HH:MM"
  const [hhStr, mmStr] = hhmm.split(":");
  const hh = Number(hhStr);
  const mm = Number(mmStr);

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return hhmm;

  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function FastingCard() {
  const [settings, setSettings] = useState<FastingSettings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // edit fields
  const [start, setStart] = useState("12:00"); // stored as "HH:MM"
  const [eatHours, setEatHours] = useState("8");

  // tick every minute for countdown
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    (async () => {
      try {
        const s = await getOrCreateFastingSettings();
        setSettings(s);

        // Postgres time may come back "HH:MM:SS" → keep HH:MM
        const normalizedStart = String(s.eating_start).slice(0, 5);
        setStart(normalizedStart);
        setEatHours(String(s.eating_hours));
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load fasting settings.");
      }
    })();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const status = useMemo(() => {
    if (!settings) return null;
    return computeFastingStatus(settings, now);
  }, [settings, now]);

  async function save() {
    setErr(null);
    try {
      const hours = Number(eatHours);

      // start is already from <input type="time"> and should be "HH:MM"
      await updateFastingSettings({ eating_start: start, eating_hours: hours });

      const updated: FastingSettings = { eating_start: start, eating_hours: hours };
      setSettings(updated);
      setEditing(false);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save.");
    }
  }

  function applyPreset(eating_hours: number) {
    setEatHours(String(eating_hours));
  }

  if (!settings) {
    return (
      <div className="border rounded-xl p-4">
        <div className="font-semibold">Fasting window</div>
        <div className="text-sm opacity-70">Loading…</div>
        {err && <div className="text-sm text-red-600 mt-2">{err}</div>}
      </div>
    );
  }

  const fastingHours = 24 - settings.eating_hours;
  const displayStart = formatTimeAMPM(String(settings.eating_start).slice(0, 5));

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">Fasting window</div>
          <div className="text-sm opacity-70">
            Plan: {fastingHours} / {settings.eating_hours} · Start: {displayStart}
          </div>
        </div>

        <button
          className="border rounded-lg px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Close" : "Edit"}
        </button>
      </div>

      {status && (
        <div className="border rounded-xl p-3">
          <div className="text-xs opacity-70">Right now</div>
          <div className="text-lg font-semibold">
            {status.mode === "eating" ? "🍽️ Eating window" : "⏳ Fasting window"}
          </div>
          <div className="text-sm opacity-70">
            Switches in {formatDuration(status.minutesUntilSwitch)} (at{" "}
            {status.nextSwitchAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})
          </div>
        </div>
      )}

      {editing && (
        <div className="space-y-3">
          {err && <div className="text-sm text-red-600">{err}</div>}

          <div className="border rounded-xl p-3 space-y-2">
            <div className="font-medium">Presets</div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="border rounded-lg px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  onClick={() => applyPreset(p.eating_hours)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="text-xs opacity-70">
              Note: 12/8 is not offered because it doesn’t sum to 24 — custom still must.
            </div>
          </div>

          <div className="border rounded-xl p-3 space-y-2">
            <div className="font-medium">Custom</div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-sm">Eating start</label>
                <input
                  className="w-full border rounded px-3 py-2 bg-transparent"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
                <div className="text-xs opacity-70">Shows Apple-style time picker on iOS.</div>
              </div>

              <div className="space-y-1">
                <label className="text-sm">Eating hours</label>
                <input
                  className="w-full border rounded px-3 py-2 bg-transparent"
                  value={eatHours}
                  onChange={(e) => setEatHours(e.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="text-xs opacity-70">
              Fasting hours will be <b>{24 - (Number(eatHours) || settings.eating_hours)}</b>. Total must equal 24.
            </div>

            <button
              type="button"
              className="border rounded-lg px-4 py-2 font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900"
              onClick={save}
            >
              Save fasting window
            </button>
          </div>
        </div>
      )}
    </div>
  );
}