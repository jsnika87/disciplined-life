// src/app/(app)/word/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

type WordEntryRow = {
  id?: string;
  user_id: string;
  entry_date: string; // YYYY-MM-DD
  reference: string | null;
  notes: string | null;
  created_at?: string | null;
  updated_at?: string | null;
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

async function ensureDailyEntry(uid: string, todayUtc: string): Promise<string> {
  // ✅ Atomic get-or-create
  const upserted = await supabase
    .schema("disciplined")
    .from("daily_entries")
    .upsert({ user_id: uid, entry_date: todayUtc }, { onConflict: "user_id,entry_date" })
    .select("id")
    .single<{ id: string }>();

  if (upserted.error) throw upserted.error;
  return upserted.data.id;
}

async function markWordPillar(uid: string, todayUtc: string, completed: boolean) {
  const entryId = await ensureDailyEntry(uid, todayUtc);

  // seed row without overwrite
  const seed = await supabase
    .schema("disciplined")
    .from("daily_pillars")
    .upsert(
      [
        {
          entry_id: entryId,
          pillar: "word",
          completed: false,
          completed_at: null,
          source: null,
        },
      ],
      { onConflict: "entry_id,pillar", ignoreDuplicates: true }
    );

  if (seed.error) throw seed.error;

  const upd = await supabase
    .schema("disciplined")
    .from("daily_pillars")
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      source: "auto",
    })
    .eq("entry_id", entryId)
    .eq("pillar", "word");

  if (upd.error) throw upd.error;

  window.dispatchEvent(new Event("dl:pillar-updated"));
}

async function fetchWordToday(todayUtc: string): Promise<WordEntryRow | null> {
  const uid = await getUserId();

  const { data, error } = await supabase
    .schema("disciplined")
    .from("word_entries")
    .select("id,user_id,entry_date,reference,notes,created_at,updated_at")
    .eq("user_id", uid)
    .eq("entry_date", todayUtc)
    .maybeSingle<WordEntryRow>();

  if (error) throw error;

  return data ?? null;
}

export default function WordPage() {
  const queryClient = useQueryClient();
  const todayUtc = useMemo(() => todayISODateUTC(), []);

  const [mode, setMode] = useState<"edit" | "view">("edit");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [markComplete, setMarkComplete] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const wordQuery = useQuery({
    queryKey: ["word-today", todayUtc],
    queryFn: () => fetchWordToday(todayUtc),
    staleTime: 30_000,
  });

  const saved = wordQuery.data ?? null;

  // When data loads, initialize the form + mode
  if (!wordQuery.isLoading) {
    if (saved && mode !== "view") {
      setMode("view");
    }
    if (!saved && mode !== "edit") {
      setMode("edit");
    }

    // Sync fields only when entering the appropriate state
    if (saved && mode === "view") {
      // nothing required; view uses saved values
    } else if (saved && mode === "edit") {
      // if user just clicked Edit, they want current values
      // (we set these on Edit button click below)
    } else if (!saved && mode === "edit") {
      // blank state is fine
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      setMsg(null);
      const uid = await getUserId();

      const entry: WordEntryRow = {
        user_id: uid,
        entry_date: todayUtc,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error: entryErr } = await supabase
        .schema("disciplined")
        .from("word_entries")
        .upsert(entry, { onConflict: "user_id,entry_date" })
        .select("id,user_id,entry_date,reference,notes,created_at,updated_at")
        .single<WordEntryRow>();

      if (entryErr) throw entryErr;

      await markWordPillar(uid, todayUtc, markComplete);

      return data;
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["word-today", todayUtc] });
      await queryClient.invalidateQueries({ queryKey: ["today"] });

      setMsg("Saved.");
      setMode("view");
    },
    onError: (e: any) => setMsg(e?.message ?? "Failed to save."),
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      setMsg(null);
      const uid = await getUserId();

      const { error: delErr } = await supabase
        .schema("disciplined")
        .from("word_entries")
        .delete()
        .eq("user_id", uid)
        .eq("entry_date", todayUtc);

      if (delErr) throw delErr;

      await markWordPillar(uid, todayUtc, false);
      return true;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["word-today", todayUtc] });
      await queryClient.invalidateQueries({ queryKey: ["today"] });

      setReference("");
      setNotes("");
      setMarkComplete(true);
      setMode("edit");
      setMsg("Cleared for today.");
    },
    onError: (e: any) => setMsg(e?.message ?? "Failed to clear."),
  });

  const loading = wordQuery.isLoading;
  const busy = saveMutation.isPending || clearMutation.isPending || wordQuery.isFetching;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Word</h1>
          <div className="text-sm opacity-70 mt-1">Today (UTC): {todayUtc}</div>
        </div>

        <div className="flex gap-2">
          <Link
            href="/word/history"
            className="border rounded-xl px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            History
          </Link>

          <button
            className="border rounded-xl px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
            onClick={() => wordQuery.refetch()}
            disabled={loading || busy}
          >
            {busy && !loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="border rounded-2xl p-6 space-y-5">
        {loading ? (
          <div className="text-sm opacity-70">Loading…</div>
        ) : saved && mode === "view" ? (
          <>
            <div className="text-sm opacity-70">You have a saved Word entry for today.</div>

            <div className="space-y-1">
              <div className="text-sm opacity-70">Reference</div>
              <div className="text-sm font-medium">{saved.reference || "—"}</div>
            </div>

            <div className="space-y-1">
              <div className="text-sm opacity-70">Notes</div>
              <div className="text-sm whitespace-pre-wrap">
                {saved.notes ? saved.notes : <span className="opacity-60">No notes.</span>}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                className="border rounded-xl px-5 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
                onClick={() => {
                  setReference(saved.reference ?? "");
                  setNotes(saved.notes ?? "");
                  setMarkComplete(true);
                  setMode("edit");
                }}
                disabled={busy}
              >
                Edit
              </button>

              <button
                className="border rounded-xl px-5 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
                onClick={() => clearMutation.mutate()}
                disabled={busy}
              >
                {clearMutation.isPending ? "Clearing…" : "Clear today"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm opacity-70">
              Save your Word entry for today. Saving can also mark Word complete on Today.
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Scripture reference</div>
              <input
                className="w-full border rounded-xl px-4 py-3 bg-transparent"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g., Matthew 1:1-20"
                disabled={loading || busy}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Notes</div>
              <textarea
                className="w-full min-h-[240px] border rounded-xl px-4 py-3 bg-transparent"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Write what stood out, what God is teaching you, and one next step…"
                disabled={loading || busy}
              />
            </div>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={markComplete}
                onChange={(e) => setMarkComplete(e.target.checked)}
                disabled={loading || busy}
              />
              Mark Word as completed today
            </label>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                className="border rounded-xl px-5 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
                onClick={() => saveMutation.mutate()}
                disabled={loading || busy}
              >
                {saveMutation.isPending ? "Saving…" : "Save"}
              </button>

              {saved ? (
                <button
                  className="border rounded-xl px-5 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  onClick={() => {
                    setMode("view");
                    setMsg(null);
                  }}
                  disabled={busy}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </>
        )}

        {msg && <div className="text-sm">{msg}</div>}

        <div className="text-xs opacity-60 pt-4">
          Future state: “Pick a passage” (YouVersion) and “Pick a topic” will plug into this same table without changing your saved history.
        </div>
      </div>
    </div>
  );
}