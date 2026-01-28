// src/app/(app)/word/history/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import HistoryShell from "@/components/history/HistoryShell";

type WordEntry = {
  id: string;
  user_id: string;
  entry_date: string; // YYYY-MM-DD
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

async function getUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const uid = data.user?.id;
  if (!uid) throw new Error("Not logged in.");
  return uid;
}

export default function WordHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WordEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const todayUtc = useMemo(() => new Date().toISOString().slice(0, 10), []);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const uid = await getUserId();

      const { data, error } = await supabase
        .schema("disciplined")
        .from("word_entries")
        .select("id,user_id,entry_date,reference,notes,created_at,updated_at")
        .eq("user_id", uid)
        .order("entry_date", { ascending: false })
        .limit(200);

      if (error) throw error;

      setRows((data ?? []) as WordEntry[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <HistoryShell title="Word history">
      <div className="flex items-start justify-between gap-4">
        <div className="text-sm opacity-70">Your saved Word entries (latest first).</div>

        <div className="flex gap-2">
          <Link
            href="/word"
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
          No Word entries yet. Go to{" "}
          <Link className="underline" href="/word">
            Word
          </Link>{" "}
          and save one.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const isToday = r.entry_date === todayUtc;
            return (
              <div key={r.id} className="border rounded-2xl p-5 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold">
                    {r.entry_date}
                    {isToday ? <span className="ml-2 text-xs opacity-70">(today)</span> : null}
                  </div>
                  <div className="text-xs opacity-60">
                    Updated {r.updated_at ? new Date(r.updated_at).toLocaleString() : ""}
                  </div>
                </div>

                <div className="text-sm">
                  <span className="opacity-70">Reference:</span>{" "}
                  <span className="font-medium">{r.reference || "—"}</span>
                </div>

                <div className="text-sm whitespace-pre-wrap">
                  {r.notes ? r.notes : <span className="opacity-60">No notes.</span>}
                </div>

                {isToday ? (
                  <div className="pt-2">
                    <Link
                      href="/word"
                      className="inline-flex border rounded-xl px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                      Edit today’s entry
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