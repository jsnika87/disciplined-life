"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  ensureServiceWorker,
  requestPushPermission,
  unsubscribeFromPush,
} from "@/lib/pushClient";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function isPushEnabled() {
  const reg = await ensureServiceWorker();
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

async function subscribeAndStore() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY.");

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Not logged in.");

  const reg = await ensureServiceWorker();

  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  // ✅ IMPORTANT: convert to a plain JSON object that includes keys
  const subscriptionJson =
    typeof (sub as any).toJSON === "function" ? (sub as any).toJSON() : sub;

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      subscription: subscriptionJson,
      userAgent: navigator.userAgent,
    }),
  });

  if (!res.ok) throw new Error(await res.text());
  return sub;
}

export default function PushSettingsCard() {
  const [enabled, setEnabled] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const env = useMemo(() => {
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supaAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const vapidPub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
    return {
      supaUrl,
      hasSupaUrl: !!supaUrl,
      anonLen: supaAnon.length,
      hasAnon: supaAnon.length > 0,
      vapidLen: vapidPub.length,
      hasVapid: vapidPub.length > 0,
    };
  }, []);

  async function refresh() {
    try {
      const p = ("Notification" in window
        ? Notification.permission
        : "default") as NotificationPermission;
      setPerm(p);
      setEnabled(await isPushEnabled());
    } catch {
      setEnabled(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onEnable() {
    setBusy(true);
    setMsg(null);
    try {
      const permission = await requestPushPermission();
      setPerm(permission);

      if (permission !== "granted") {
        setMsg("Notifications permission was not granted.");
        return;
      }

      await subscribeAndStore();
      await refresh();
      setMsg("Notifications enabled.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function onDisable() {
    setBusy(true);
    setMsg(null);
    try {
      await unsubscribeFromPush();
      await refresh();
      setMsg("Notifications disabled.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to disable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function onTest() {
    setBusy(true);
    setMsg(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Not logged in.");

      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) throw new Error(await res.text());
      setMsg("Test push sent.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to send test push.");
    } finally {
      setBusy(false);
    }
  }

  const envOk = env.hasSupaUrl && env.hasAnon && env.hasVapid;

  return (
    <div className="border rounded-xl p-4 space-y-2">
      <div className="font-semibold">Notifications</div>
      <div className="text-sm opacity-70">
        Permission: <b>{perm}</b> · Status: <b>{enabled ? "Enabled" : "Disabled"}</b>
      </div>

      <div className="text-xs opacity-70">
        Env debug: URL={env.hasSupaUrl ? env.supaUrl : "(missing)"} · ANON_LEN={env.anonLen} ·
        VAPID_LEN={env.vapidLen}
      </div>

      {!envOk && (
        <div className="text-sm text-red-600">
          Missing env vars in the browser build. Need NEXT_PUBLIC_SUPABASE_URL,
          NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY.
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {!enabled ? (
          <button
            className="border rounded-lg px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
            onClick={onEnable}
            disabled={busy}
          >
            Enable
          </button>
        ) : (
          <button
            className="border rounded-lg px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
            onClick={onDisable}
            disabled={busy}
          >
            Disable
          </button>
        )}

        <button
          className="border rounded-lg px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
          onClick={onTest}
          disabled={busy || !enabled}
        >
          Send test push
        </button>
      </div>

      {msg && <div className="text-sm">{msg}</div>}
    </div>
  );
}