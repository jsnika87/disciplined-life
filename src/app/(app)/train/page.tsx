"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type PillarKey = "train" | "eat" | "word" | "freedom";

type DailyEntry = {
  id: string;
  user_id: string;
  entry_date: string;
};

type DailyPillar = {
  entry_id: string;
  pillar: PillarKey;
  completed: boolean;
  completed_at: string | null;
  source: "manual" | "auto" | null;
  notes?: string | null;
};

function todayISODateUTC() {
  return new Date().toISOString().slice(0, 10);
}

async function getUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const uid = data.user?.id;
  if (!uid) throw new Error("Not logged in.");
  return uid;
}

export default function TrainPage() {
  const todayUtc = useMemo(() => todayISODateUTC(), []);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [entry, setEntry] = useState<DailyEntry | null>(null);
  const [pillar, setPillar] = useState<DailyPillar | null>(null);

  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const [mode, setMode] = useState<"edit" | "view">("edit");

  // prevents concurrent ensure/load races
  const ensureInFlightRef = useRef(false);

  const completed = !!pillar?.completed;

  async function ensureTodayEntry(uid: string): Promise<DailyEntry> {
    // ✅ Atomic get-or-create via upsert (prevents 409 duplicate key races)
    const upserted = await supabase
      .schema("disciplined")
      .from("daily_entries")
      .upsert({ user_id: uid, entry_date: todayUtc }, { onConflict: "user_id,entry_date" })
      .select("id,user_id,entry_date")
      .single<DailyEntry>();

    if (upserted.error) throw upserted.error;
    return upserted.data;
  }

  async function load() {
    if (ensureInFlightRef.current) return;
    ensureInFlightRef.current = true;

    setLoading(true);
    setMsg(null);

    try {
      const uid = await getUserId();
      const e = await ensureTodayEntry(uid);
      setEntry(e);

      // Seed the train pillar row without overwriting
      const seed = await supabase
        .schema("disciplined")
        .from("daily_pillars")
        .upsert(
          [
            {
              entry_id: e.id,
              pillar: "train",
              completed: false,
              completed_at: null,
              source: null,
              notes: null,
            },
          ],
          { onConflict: "entry_id,pillar", ignoreDuplicates: true }
        );

      if (seed.error) throw seed.error;

      const { data, error } = await supabase
        .schema("disciplined")
        .from("daily_pillars")
        .select("entry_id,pillar,completed,completed_at,source,notes")
        .eq("entry_id", e.id)
        .eq("pillar", "train")
        .maybeSingle<DailyPillar>();

      if (error) throw error;

      setPillar(data ?? null);
      setNotes((data?.notes as string | null) ?? "");

      // default mode: if completed, show view mode; else edit
      setMode(data?.completed ? "view" : "edit");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to load Train.");
    } finally {
      setLoading(false);
      ensureInFlightRef.current = false;
    }
  }

  async function save(completedNext: boolean) {
    if (!entry) return;

    setBusy(true);
    setMsg(null);

    try {
      const { error } = await supabase
        .schema("disciplined")
        .from("daily_pillars")
        .update({
          completed: completedNext,
          completed_at: completedNext ? new Date().toISOString() : null,
          source: "manual",
          notes: notes.trim() || null,
        })
        .eq("entry_id", entry.id)
        .eq("pillar", "train");

      if (error) throw error;

      window.dispatchEvent(new Event("dl:pillar-updated"));
      await load();

      setMsg("Saved.");
      setMode(completedNext ? "view" : "edit");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Train</h1>
          <div className="text-sm opacity-70 mt-1">Today (UTC): {todayUtc}</div>
        </div>

        <div className="flex gap-2">
          <Link
            href="/train/history"
            className="border rounded-xl px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            History
          </Link>

          <button
            className="border rounded-xl px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
            onClick={load}
            disabled={loading || busy}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="border rounded-2xl p-6 space-y-5">
        {loading ? (
          <div className="text-sm opacity-70">Loading…</div>
        ) : completed && mode === "view" ? (
          <>
            <div className="text-sm opacity-70">✅ Train is completed for today.</div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Notes</div>
              <div className="text-sm whitespace-pre-wrap">
                {pillar?.notes ? pillar.notes : <span className="opacity-60">No notes.</span>}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                className="border rounded-xl px-5 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
                onClick={() => setMode("edit")}
                disabled={busy}
              >
                Edit
              </button>

              <button
                className="border rounded-xl px-5 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
                onClick={() => save(false)}
                disabled={busy}
              >
                Undo completion
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm opacity-70">
              Train v1: mark today complete (optional notes). Later we can expand to workouts, PRs, etc.
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Notes (optional)</div>
              <textarea
                className="w-full min-h-[180px] border rounded-xl px-4 py-3 bg-transparent"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What did you train? Any notes?"
                disabled={loading || busy}
              />
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                className="border rounded-xl px-5 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
                onClick={() => save(true)}
                disabled={loading || busy}
              >
                Save + mark complete
              </button>

              {completed ? (
                <button
                  className="border rounded-xl px-5 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  onClick={() => setMode("view")}
                  disabled={busy}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </>
        )}

        {msg && <div className="text-sm">{msg}</div>}
      </div>
    </div>
  );
}