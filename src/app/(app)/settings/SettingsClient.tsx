"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PushSettingsClient from "./PushSettingsClient";

type FastingSettings = {
  eating_start: string; // "HH:MM:SS"
  eating_hours: number;
  notify_window_start: boolean;
  notify_window_end: boolean;
};

type UserSettings = {
  timezone: string | null;
  push_enabled: boolean;
  push_fasting_windows: boolean;
  push_daily_reminder: boolean;
  daily_reminder_time_min: number | null;
};

function minToHHMM(min: number) {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function hhmmToMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  return h * 60 + m;
}

export default function SettingsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [fasting, setFasting] = useState<FastingSettings | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);

  const reminderHHMM = useMemo(() => {
    if (!userSettings?.daily_reminder_time_min && userSettings?.daily_reminder_time_min !== 0) return "20:00";
    return minToHHMM(userSettings.daily_reminder_time_min);
  }, [userSettings?.daily_reminder_time_min]);

  async function load() {
    setErr(null);
    setLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not logged in.");

      // Load fasting settings
      const f = await supabase
        .schema("disciplined")
        .from("fasting_settings")
        .select("eating_start,eating_hours,notify_window_start,notify_window_end")
        .maybeSingle<FastingSettings>();

      if (f.error) throw f.error;

      // If missing row, create a default
      let fastingRow = f.data;
      if (!fastingRow) {
        const created = await supabase
          .schema("disciplined")
          .from("fasting_settings")
          .insert({
            eating_start: "12:00",
            eating_hours: 8,
            notify_window_start: true,
            notify_window_end: true,
          })
          .select("eating_start,eating_hours,notify_window_start,notify_window_end")
          .single<FastingSettings>();
        if (created.error) throw created.error;
        fastingRow = created.data;
      }

      setFasting(fastingRow);

      // Load user_settings
      const u = await supabase
        .schema("disciplined")
        .from("user_settings")
        .select(
          "timezone,push_enabled,push_fasting_windows,push_daily_reminder,daily_reminder_time_min"
        )
        .maybeSingle<UserSettings>();

      if (u.error) throw u.error;

      // Default user_settings row if missing
      let userRow = u.data;
      if (!userRow) {
        const created = await supabase
          .schema("disciplined")
          .from("user_settings")
          .insert({
            push_enabled: true,
            push_fasting_windows: true,
            push_daily_reminder: false,
            daily_reminder_time_min: 20 * 60, // 8pm
          })
          .select(
            "timezone,push_enabled,push_fasting_windows,push_daily_reminder,daily_reminder_time_min"
          )
          .single<UserSettings>();
        if (created.error) throw created.error;
        userRow = created.data;
      }

      setUserSettings(userRow);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveFasting(next: Partial<FastingSettings>) {
    if (!fasting) return;
    setErr(null);
    setSaving("fasting");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not logged in.");

      const res = await fetch("/api/settings/fasting", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...fasting, ...next }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Save failed (${res.status}) ${txt}`);
      }

      const json = await res.json();
      setFasting(json.fasting);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(null);
    }
  }

  async function saveReminder(next: Partial<UserSettings>) {
    if (!userSettings) return;
    setErr(null);
    setSaving("reminder");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not logged in.");

      const res = await fetch("/api/settings/reminder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...userSettings, ...next }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Save failed (${res.status}) ${txt}`);
      }

      const json = await res.json();
      setUserSettings(json.userSettings);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <div className="min-h-[50vh] flex items-center justify-center opacity-70">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm opacity-70">Push, fasting, reminders, and Bible settings.</p>
      </div>

      {err ? (
        <div className="rounded-xl border p-3 text-sm bg-red-50">
          <div className="font-semibold">Error</div>
          <div className="opacity-80">{err}</div>
        </div>
      ) : null}

      {/* Push */}
      <section className="rounded-2xl border p-4 space-y-3">
        <div>
          <div className="font-semibold">Push Notifications</div>
          <div className="text-sm opacity-70">Enable/disable, subscribe/unsubscribe, test push.</div>
        </div>
        <PushSettingsClient />
      </section>

      {/* Fasting */}
      <section className="rounded-2xl border p-4 space-y-3">
        <div>
          <div className="font-semibold">Fasting Window</div>
          <div className="text-sm opacity-70">This controls your eating window and notifications.</div>
        </div>

        {!fasting ? (
          <div className="text-sm opacity-70">Missing fasting settings.</div>
        ) : (
          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-sm">Eating window start</span>
              <input
                type="time"
                value={String(fasting.eating_start).slice(0, 5)}
                onChange={(e) => saveFasting({ eating_start: e.target.value })}
                className="rounded-lg border px-3 py-2"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm">Eating window length (hours)</span>
              <input
                type="number"
                min={1}
                max={23}
                value={fasting.eating_hours}
                onChange={(e) => saveFasting({ eating_hours: Number(e.target.value) })}
                className="rounded-lg border px-3 py-2"
              />
              <span className="text-xs opacity-60">Fasting hours = 24 − eating hours.</span>
            </label>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!fasting.notify_window_start}
                  onChange={(e) => saveFasting({ notify_window_start: e.target.checked })}
                />
                Notify when eating starts
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!fasting.notify_window_end}
                  onChange={(e) => saveFasting({ notify_window_end: e.target.checked })}
                />
                Notify when fasting starts
              </label>
            </div>

            {saving === "fasting" ? <div className="text-xs opacity-70">Saving…</div> : null}
          </div>
        )}
      </section>

      {/* Daily Reminder */}
      <section className="rounded-2xl border p-4 space-y-3">
        <div>
          <div className="font-semibold">Daily Reminder</div>
          <div className="text-sm opacity-70">Send a reminder if your pillars aren’t finished.</div>
        </div>

        {!userSettings ? (
          <div className="text-sm opacity-70">Missing user settings.</div>
        ) : (
          <div className="grid gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!userSettings.push_daily_reminder}
                onChange={(e) => saveReminder({ push_daily_reminder: e.target.checked })}
              />
              Enable daily reminder
            </label>

            <label className="grid gap-1">
              <span className="text-sm">Reminder time</span>
              <input
                type="time"
                value={reminderHHMM}
                onChange={(e) => saveReminder({ daily_reminder_time_min: hhmmToMin(e.target.value) })}
                className="rounded-lg border px-3 py-2"
              />
            </label>

            {saving === "reminder" ? <div className="text-xs opacity-70">Saving…</div> : null}
          </div>
        )}
      </section>

      {/* Bible / YouVersion */}
      <section className="rounded-2xl border p-4 space-y-3">
        <div>
          <div className="font-semibold">Bible (YouVersion)</div>
          <div className="text-sm opacity-70">We’ll store preferences here (not your API key).</div>
        </div>

        <div className="text-sm opacity-70">
          Next step: preferred Bible version selector + passage picker in Word tab.
        </div>
      </section>

      <button
        type="button"
        onClick={load}
        className="rounded-xl border px-4 py-2 text-sm hover:bg-muted"
      >
        Reload settings
      </button>
    </div>
  );
}