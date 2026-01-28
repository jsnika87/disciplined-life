"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: "pending" | "user" | "admin";
  approved: boolean;
  created_at: string;
};

export default function AdminApprovalsPage() {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .schema("disciplined")
      .from("profiles")
      .select("id,email,display_name,role,approved,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as ProfileRow[]);
    setLoading(false);
  }

  async function approveAsUser(id: string) {
    setBusyId(id);
    setError(null);

    const { error } = await supabase
      .schema("disciplined")
      .from("profiles")
      .update({ approved: true, role: "user" })
      .eq("id", id);

    if (error) setError(error.message);

    await load();
    setBusyId(null);
  }

  async function approveAsAdmin(id: string) {
    setBusyId(id);
    setError(null);

    const { error } = await supabase
      .schema("disciplined")
      .from("profiles")
      .update({ approved: true, role: "admin" })
      .eq("id", id);

    if (error) setError(error.message);

    await load();
    setBusyId(null);
  }

  useEffect(() => {
    load();
  }, []);

  const pending = useMemo(
    () => rows.filter((r) => !r.approved || r.role === "pending"),
    [rows]
  );
  const approved = useMemo(
    () => rows.filter((r) => r.approved && r.role !== "pending"),
    [rows]
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Admin approvals</h1>
        <p className="text-sm opacity-70">
          Approve new users for Disciplined Life (disciplined schema).
        </p>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Pending</h2>
          <button className="border rounded px-3 py-2 text-sm" onClick={load}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-sm opacity-70">Loading…</div>
        ) : pending.length === 0 ? (
          <div className="text-sm opacity-70">No pending users.</div>
        ) : (
          <div className="space-y-2">
            {pending.map((u) => (
              <div
                key={u.id}
                className="border rounded p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{u.email ?? "(no email)"}</div>
                  <div className="text-xs opacity-70">
                    role: {u.role} · approved: {String(u.approved)}
                  </div>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    className="border rounded px-3 py-1 text-sm"
                    disabled={busyId === u.id}
                    onClick={() => approveAsUser(u.id)}
                  >
                    {busyId === u.id ? "Working…" : "Approve"}
                  </button>
                  <button
                    className="border rounded px-3 py-1 text-sm"
                    disabled={busyId === u.id}
                    onClick={() => approveAsAdmin(u.id)}
                  >
                    {busyId === u.id ? "Working…" : "Make admin"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Approved</h2>

        {loading ? (
          <div className="text-sm opacity-70">Loading…</div>
        ) : approved.length === 0 ? (
          <div className="text-sm opacity-70">No approved users yet.</div>
        ) : (
          <div className="space-y-2">
            {approved.map((u) => (
              <div key={u.id} className="border rounded p-3">
                <div className="font-medium">{u.email ?? "(no email)"}</div>
                <div className="text-xs opacity-70">
                  role: {u.role} · approved: {String(u.approved)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}