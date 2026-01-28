"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type FreedomEntry = {
  id: string;
  user_id: string;
  entry_date: string; // YYYY-MM-DD
  action_type: string;
  custom_action: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
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

export default function FreedomPage() {
  const todayUtc = useMemo(() => todayISODateUTC(), []);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [saved, setSaved] = useState<FreedomEntry | null>(null);
  const [mode, setMode] = useState<"edit" | "view">("edit");

  const [actionType, setActionType] = useState<string>("avoid_trigger");
  const [customAction, setCustomAction] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [msg, setMsg] = useState<string | null>(null);

  // prevent concurrent ensure/mark storms
  const ensureEntryInFlightRef = useRef(false);

  const actionLabel = useMemo(() => {
    if (!saved) return "";
    return saved.action_type === "custom" ? saved.custom_action || "Custom" : saved.action_type;
  }, [saved]);

  async function ensureDailyEntry(uid: string) {
    if (ensureEntryInFlightRef.current) {
      await new Promise((r) => setTimeout(r, 50));
    }
    ensureEntryInFlightRef.current = true;

    try {
      // ✅ Atomic create-or-get
      const upserted = await supabase
        .schema("disciplined")
        .from("daily_entries")
        .upsert(
          { user_id: uid, entry_date: todayUtc },
          { onConflict: "user_id,entry_date" }
        )
        .select("id")
        .single<{ id: string }>();

      if (upserted.error) throw upserted.error;
      return upserted.data.id;
    } finally {
      ensureEntryInFlightRef.current = false;
    }
  }

  async function markFreedomComplete(uid: string, completed: boolean) {
    const entryId = await ensureDailyEntry(uid);

    // seed row without overwrite
    const seed = await supabase
      .schema("disciplined")
      .from("daily_pillars")
      .upsert(
        [
          {
            entry_id: entryId,
            pillar: "freedom",
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
      .eq("pillar", "freedom");

    if (upd.error) throw upd.error;

    window.dispatchEvent(new Event("dl:pillar-updated"));
  }

  async function load() {
    setLoading(true);
    setMsg(null);

    try {
      const uid = await getUserId();

      const { data, error } = await supabase
        .schema("disciplined")
        .from("freedom_entries")
        .select("id,user_id,entry_date,action_type,custom_action,notes,created_at,updated_at")
        .eq("user_id", uid)
        .eq("entry_date", todayUtc)
        .maybeSingle<FreedomEntry>();

      if (error) throw error;

      if (data) {
        setSaved(data);
        setMode("view");
        setActionType(data.action_type);
        setCustomAction(data.custom_action ?? "");
        setNotes(data.notes ?? "");
      } else {
        setSaved(null);
        setMode("edit");
        setActionType("avoid_trigger");
        setCustomAction("");
        setNotes("");
      }
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to load Freedom.");
    } finally {
      setLoading(false);
    }
  }

  async function onSave() {
    setBusy(true);
    setMsg(null);

    try {
      const uid = await getUserId();

      const entry = {
        user_id: uid,
        entry_date: todayUtc,
        action_type: actionType,
        custom_action: actionType === "custom" ? (customAction.trim() || null) : null,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .schema("disciplined")
        .from("freedom_entries")
        .upsert(entry, { onConflict: "user_id,entry_date" })
        .select("id,user_id,entry_date,action_type,custom_action,notes,created_at,updated_at")
        .single<FreedomEntry>();

      if (error) throw error;

      setSaved(data);
      setMode("view");

      await markFreedomComplete(uid, true);

      setMsg("Saved.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  async function onClearToday() {
    setBusy(true);
    setMsg(null);

    try {
      const uid = await getUserId();

      const { error } = await supabase
        .schema("disciplined")
        .from("freedom_entries")
        .delete()
        .eq("user_id", uid)
        .eq("entry_date", todayUtc);

      if (error) throw error;

      setSaved(null);
      setMode("edit");
      setActionType("avoid_trigger");
      setCustomAction("");
      setNotes("");

      await markFreedomComplete(uid, false);

      setMsg("Cleared for today.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to clear.");
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
          <h1 className="text-3xl font-semibold">Freedom</h1>
          <div className="text-sm opacity-70 mt-1">Today (UTC): {todayUtc}</div>
        </div>

        <div className="flex gap-2">
          <Link
            href="/freedom/history"
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
        {saved && mode === "view" ? (
          <>
            <div className="text-sm opacity-70">You have a saved Freedom entry for today.</div>

            <div className="text-sm">
              <span className="opacity-70">Action:</span>{" "}
              <span className="font-medium">{actionLabel}</span>
            </div>

            <div className="text-sm whitespace-pre-wrap">
              {saved.notes ? saved.notes : <span className="opacity-60">No notes.</span>}
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
                onClick={onClearToday}
                disabled={busy}
              >
                Clear today
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm opacity-70">
              Log what you did today for Freedom. Saving will mark Freedom complete on Today.
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Action note</div>
              <select
                className="w-full border rounded-xl px-4 py-3 bg-transparent"
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
                disabled={loading || busy}
              >
                <option value="avoid_trigger">Avoided a trigger</option>
                <option value="accountability">Used accountability</option>
                <option value="prayer_reset">Prayer / reset</option>
                <option value="replaced_habit">Replaced the habit</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            {actionType === "custom" ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">Custom action</div>
                <input
                  className="w-full border rounded-xl px-4 py-3 bg-transparent"
                  value={customAction}
                  onChange={(e) => setCustomAction(e.target.value)}
                  placeholder="Describe your action…"
                  disabled={loading || busy}
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="text-sm font-medium">Notes (optional)</div>
              <textarea
                className="w-full min-h-[220px] border rounded-xl px-4 py-3 bg-transparent"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What happened, what you did, and what you’ll do next time…"
                disabled={loading || busy}
              />
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                className="border rounded-xl px-5 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
                onClick={onSave}
                disabled={loading || busy}
              >
                Save
              </button>

              {saved ? (
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