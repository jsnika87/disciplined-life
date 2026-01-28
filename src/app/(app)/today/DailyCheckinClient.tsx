"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type PillarKey = "train" | "eat" | "word" | "freedom";

type DailyEntry = {
  id: string;
  user_id: string;
  entry_date: string; // YYYY-MM-DD
};

type DailyPillar = {
  entry_id: string;
  pillar: PillarKey;
  completed: boolean;
  completed_at: string | null;
  source: "manual" | "auto" | null;
  notes?: string | null;
};

const PILLARS: { key: PillarKey; label: string; emoji: string }[] = [
  { key: "train", label: "Train", emoji: "🏋️" },
  { key: "eat", label: "Eat", emoji: "🍽️" },
  { key: "word", label: "Word", emoji: "📖" },
  { key: "freedom", label: "Freedom", emoji: "🛡️" },
];

function todayISODateUTC() {
  return new Date().toISOString().slice(0, 10);
}

export default function DailyCheckinClient() {
  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState<DailyEntry | null>(null);
  const [pillars, setPillars] = useState<DailyPillar[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyPillar, setBusyPillar] = useState<PillarKey | null>(null);

  // prevents concurrent ensureToday() calls (race -> duplicate inserts)
  const ensureInFlightRef = useRef(false);

  const byKey = useMemo(() => {
    const map = new Map<PillarKey, DailyPillar>();
    for (const p of pillars) map.set(p.pillar, p);
    return map;
  }, [pillars]);

  const completedCount = useMemo(
    () => pillars.filter((p) => p.completed).length,
    [pillars]
  );

  async function ensureToday() {
    if (ensureInFlightRef.current) return;
    ensureInFlightRef.current = true;

    setError(null);
    setLoading(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        setError("Not logged in.");
        return;
      }

      const entryDate = todayISODateUTC();

      // ✅ Atomic "get or create" via upsert
      // This prevents the 409 duplicate-key issue when multiple calls race.
      const upserted = await supabase
        .schema("disciplined")
        .from("daily_entries")
        .upsert(
          { user_id: uid, entry_date: entryDate },
          { onConflict: "user_id,entry_date" }
        )
        .select("id,user_id,entry_date")
        .single<DailyEntry>();

      if (upserted.error) {
        setError(upserted.error.message);
        return;
      }

      const todayEntry = upserted.data;
      setEntry(todayEntry);

      // 2) Ensure 4 pillar rows exist WITHOUT overwriting existing values
      const seedRows = PILLARS.map((p) => ({
        entry_id: todayEntry.id,
        pillar: p.key,
        completed: false,
        completed_at: null,
        source: null,
        notes: null,
      }));

      const seed = await supabase
        .schema("disciplined")
        .from("daily_pillars")
        .upsert(seedRows, {
          onConflict: "entry_id,pillar",
          ignoreDuplicates: true, // do not clobber existing rows
        });

      if (seed.error) {
        setError(seed.error.message);
        return;
      }

      // 3) Load pillar rows
      const list = await supabase
        .schema("disciplined")
        .from("daily_pillars")
        .select("entry_id,pillar,completed,completed_at,source,notes")
        .eq("entry_id", todayEntry.id)
        .order("pillar", { ascending: true });

      if (list.error) {
        setError(list.error.message);
        return;
      }

      setPillars((list.data ?? []) as DailyPillar[]);
    } finally {
      setLoading(false);
      ensureInFlightRef.current = false;
    }
  }

  async function togglePillar(key: PillarKey) {
    if (!entry) return;
    setBusyPillar(key);
    setError(null);

    const current = byKey.get(key);
    const nextCompleted = !current?.completed;

    const update = await supabase
      .schema("disciplined")
      .from("daily_pillars")
      .update({
        completed: nextCompleted,
        completed_at: nextCompleted ? new Date().toISOString() : null,
        source: "manual",
      })
      .eq("entry_id", entry.id)
      .eq("pillar", key)
      .select("entry_id,pillar,completed,completed_at,source,notes")
      .single<DailyPillar>();

    if (update.error) {
      setError(update.error.message);
      setBusyPillar(null);
      return;
    }

    setPillars((prev) =>
      prev.map((p) => (p.pillar === key ? update.data : p))
    );
    setBusyPillar(null);
  }

  useEffect(() => {
    ensureToday();

    function onUpdated() {
      ensureToday();
    }

    window.addEventListener("dl:pillar-updated", onUpdated as EventListener);

    return () => {
      window.removeEventListener("dl:pillar-updated", onUpdated as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">Daily check-in</div>
          <div className="text-sm opacity-70">
            {entry ? `Date: ${entry.entry_date}` : "Loading date…"} · Completed:{" "}
            {completedCount}/4
          </div>
        </div>

        <button
          className="border rounded-lg px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
          onClick={ensureToday}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="text-sm opacity-70">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PILLARS.map((p) => {
            const row = byKey.get(p.key);
            const done = !!row?.completed;

            return (
              <div
                key={p.key}
                className="border rounded-xl p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2">
                    <span className="text-lg">{p.emoji}</span>
                    <span>{p.label}</span>
                  </div>
                  <div className="text-xs opacity-70">
                    Status: {done ? "Complete" : "Not complete"}
                    {row?.source ? ` · source: ${row.source}` : ""}
                  </div>
                </div>

                <button
                  className={[
                    "border rounded-lg px-3 py-2 text-sm font-medium",
                    done
                      ? "border-zinc-900 dark:border-zinc-100"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-900",
                  ].join(" ")}
                  onClick={() => togglePillar(p.key)}
                  disabled={busyPillar === p.key}
                >
                  {busyPillar === p.key ? "…" : done ? "Undo" : "Mark"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-xs opacity-70">
        Hybrid mode: logging actions will auto-mark pillars complete. Manual marks always stay available.
      </div>
    </div>
  );
}