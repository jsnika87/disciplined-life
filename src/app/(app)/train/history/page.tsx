// src/app/(app)/train/history/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import HistoryShell from "@/components/history/HistoryShell";

type TrainEntry = {
  id: string;
  entry_date: string; // YYYY-MM-DD
  notes: string | null;
  completed_at: string | null;
};

async function getUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const uid = data.user?.id;
  if (!uid) throw new Error("Not logged in.");
  return uid;
}

export default function TrainHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TrainEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const todayUtc = useMemo(() => new Date().toISOString().slice(0, 10), []);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const uid = await getUserId();

      const { data, error } = await supabase
        .schema("disciplined")
        .from("daily_entries")
        .select(
          `
          id,
          entry_date,
          daily_pillars!inner(entry_id,pillar,completed,completed_at,notes)
        `
        )
        .eq("user_id", uid)
        .eq("daily_pillars.pillar", "train")
        .eq("daily_pillars.completed", true)
        .order("entry_date", { ascending: false })
        .limit(200);

      if (error) throw error;

      const normalized: TrainEntry[] = (data ?? []).map((row: any) => {
        const p = Array.isArray(row.daily_pillars) ? row.daily_pillars[0] : row.daily_pillars;
        return {
          id: row.id,
          entry_date: row.entry_date,
          notes: p?.notes ?? null,
          completed_at: p?.completed_at ?? null,
        };
      });

      setRows(normalized);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load Train history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <HistoryShell title="Train history">
      <div className="flex items-start justify-between gap-4">
        <div className="text-sm opacity-70">Days you completed Train.</div>

        <div className="flex gap-2">
          <Link
            href="/train"
            className="border rounded-xl px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            Back
          </Link>

          <button
            className="border rounded-xl px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
            onClick={load}
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="text-sm opacity-70">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="border rounded-2xl p-6 text-sm opacity-70">
          No completed Train days yet. Go to{" "}
          <Link className="underline" href="/train">
            Train
          </Link>{" "}
          and mark it complete.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const isToday = r.entry_date === todayUtc;
            return (
              <div key={r.id + r.entry_date} className="border rounded-2xl p-5 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold">
                    {r.entry_date}
                    {isToday ? <span className="ml-2 text-xs opacity-70">(today)</span> : null}
                  </div>
                  <div className="text-xs opacity-60">
                    {r.completed_at ? `Completed ${new Date(r.completed_at).toLocaleString()}` : ""}
                  </div>
                </div>

                <div className="text-sm whitespace-pre-wrap">
                  {r.notes ? r.notes : <span className="opacity-60">No notes.</span>}
                </div>

                {isToday ? (
                  <div className="pt-2">
                    <Link
                      href="/train"
                      className="inline-flex border rounded-xl px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                      Edit / view today
                    </Link>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </HistoryShell>
  );
}