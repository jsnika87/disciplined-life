// src/app/(app)/train/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

async function ensureTodayEntry(uid: string, todayUtc: string): Promise<DailyEntry> {
  // ✅ Atomic get-or-create via upsert
  const upserted = await supabase
    .schema("disciplined")
    .from("daily_entries")
    .upsert({ user_id: uid, entry_date: todayUtc }, { onConflict: "user_id,entry_date" })
    .select("id,user_id,entry_date")
    .single<DailyEntry>();

  if (upserted.error) throw upserted.error;
  return upserted.data;
}

async function seedTrainPillar(entryId: string) {
  const seed = await supabase
    .schema("disciplined")
    .from("daily_pillars")
    .upsert(
      [
        {
          entry_id: entryId,
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
}

async function fetchTrainToday(todayUtc: string): Promise<{ entry: DailyEntry; pillar: DailyPillar | null }> {
  const uid = await getUserId();
  const entry = await ensureTodayEntry(uid, todayUtc);

  await seedTrainPillar(entry.id);

  const { data, error } = await supabase
    .schema("disciplined")
    .from("daily_pillars")
    .select("entry_id,pillar,completed,completed_at,source,notes")
    .eq("entry_id", entry.id)
    .eq("pillar", "train")
    .maybeSingle<DailyPillar>();

  if (error) throw error;

  return { entry, pillar: data ?? null };
}

export default function TrainPage() {
  const queryClient = useQueryClient();
  const todayUtc = useMemo(() => todayISODateUTC(), []);

  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "view">("edit");

  const trainQuery = useQuery({
    queryKey: ["train-today", todayUtc],
    queryFn: () => fetchTrainToday(todayUtc),
    staleTime: 30_000,
  });

  const entry = trainQuery.data?.entry ?? null;
  const pillar = trainQuery.data?.pillar ?? null;
  const completed = !!pillar?.completed;

  // Keep local notes + mode aligned when data arrives/changes
  // (We intentionally do this inline rather than useEffect to avoid flicker on fast cache hits.)
  if (!trainQuery.isLoading && pillar) {
    const incomingNotes = (pillar.notes as string | null) ?? "";
    if (notes === "" && incomingNotes !== "") setNotes(incomingNotes);
    if (notes !== "" && incomingNotes === "" && completed && mode === "view") {
      // do nothing
    }
  }

  const saveMutation = useMutation({
    mutationFn: async (completedNext: boolean) => {
      if (!entry) throw new Error("Missing daily entry.");

      setMsg(null);

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

      // notify Today screen / listeners
      window.dispatchEvent(new Event("dl:pillar-updated"));

      return completedNext;
    },
    onSuccess: async (completedNext) => {
      await queryClient.invalidateQueries({ queryKey: ["train-today", todayUtc] });
      // keep other areas warm too (if you later query today summary / streaks)
      await queryClient.invalidateQueries({ queryKey: ["today"] });

      setMsg("Saved.");
      setMode(completedNext ? "view" : "edit");
    },
    onError: (e: any) => setMsg(e?.message ?? "Failed to save."),
  });

  const loading = trainQuery.isLoading;
  const busy = saveMutation.isPending || trainQuery.isFetching;

  // After data loads, default mode: completed => view, else edit
  if (!loading && trainQuery.data) {
    const desired = completed ? "view" : "edit";
    if (mode !== desired && msg == null && !saveMutation.isPending) {
      // only auto-set when user isn't actively interacting
      setMode(desired);
    }
    // Always sync notes from server the first time we load
    const incomingNotes = (pillar?.notes as string | null) ?? "";
    if (!saveMutation.isPending && notes === "" && incomingNotes !== "") {
      setNotes(incomingNotes);
    }
    if (!saveMutation.isPending && notes !== "" && incomingNotes !== "" && notes !== incomingNotes && mode === "view") {
      setNotes(incomingNotes);
    }
    if (!saveMutation.isPending && incomingNotes === "" && mode === "view" && notes !== "") {
      // keep local notes as-is
    }
  }

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
            onClick={() => trainQuery.refetch()}
            disabled={loading || busy}
          >
            {busy && !loading ? "Refreshing…" : "Refresh"}
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
                onClick={() => {
                  setNotes((pillar?.notes as string | null) ?? "");
                  setMode("edit");
                }}
                disabled={busy}
              >
                Edit
              </button>

              <button
                className="border rounded-xl px-5 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
                onClick={() => saveMutation.mutate(false)}
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
                onClick={() => saveMutation.mutate(true)}
                disabled={loading || busy}
              >
                {saveMutation.isPending ? "Saving…" : "Save + mark complete"}
              </button>

              {completed ? (
                <button
                  className="border rounded-xl px-5 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  onClick={() => {
                    setNotes((pillar?.notes as string | null) ?? "");
                    setMode("view");
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
      </div>
    </div>
  );
}