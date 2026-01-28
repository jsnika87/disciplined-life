// src/app/(app)/settings/PushSettingsClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Status = "checking" | "enabled" | "disabled" | "unsupported" | "denied" | "error";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function waitForServiceWorkerControl(timeoutMs = 6000) {
  if (!("serviceWorker" in navigator)) return;

  // If already controlled, done
  if (navigator.serviceWorker.controller) return;

  // Wait for controllerchange (happens after activation/claim)
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(
        new Error(
          "Service worker still isn’t controlling this page yet. Close the PWA, reopen it, then try again."
        )
      );
    }, timeoutMs);

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true }
    );
  });
}

export default function PushSettingsClient() {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<string>("");

  const supported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }, []);

  async function fetchStatusFromServer() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      setStatus("disabled");
      return;
    }

    const res = await fetch("/api/push/status", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    const json = await res.json().catch(() => ({}));
    if (json?.subscribed) setStatus("enabled");
    else setStatus("disabled");
  }

  useEffect(() => {
    (async () => {
      try {
        if (!supported) {
          setStatus("unsupported");
          return;
        }

        if (Notification.permission === "denied") {
          setStatus("denied");
          return;
        }

        await fetchStatusFromServer();
      } catch (e: any) {
        setStatus("error");
        setDetail(e?.message ?? "Unknown error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  async function enablePush() {
    if (!supported) return;

    if (!vapidPublicKey) {
      setStatus("error");
      setDetail("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY");
      return;
    }

    // iOS check: push requires standalone mode
    const anyNav = navigator as any;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
      anyNav?.standalone === true;

    if (!standalone) {
      setStatus("error");
      setDetail(
        "On iPhone, push works only after installing to Home Screen. Install it, then reopen the app and try again."
      );
      return;
    }

    setBusy(true);
    setDetail("");

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "disabled");
        return;
      }

      // Register SW (safe even if already registered)
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });

      // Wait until SW is ready
      await navigator.serviceWorker.ready;

      // On iOS PWA, SW can be "ready" but not controlling yet
      await waitForServiceWorkerControl(7000);

      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();

      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));

      const keys = sub.toJSON().keys || {};
      const endpoint = sub.endpoint;
      const p256dh = keys.p256dh;
      const auth = keys.auth;

      if (!endpoint || !p256dh || !auth) {
        throw new Error("Browser did not return push keys (p256dh/auth).");
      }

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not logged in");

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          endpoint,
          p256dh,
          auth,
          userAgent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.message ?? j?.error ?? "Subscribe failed");
      }

      setStatus("enabled");
      setDetail("");
    } catch (e: any) {
      setStatus("error");
      setDetail(e?.message ?? "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    if (!supported) return;

    setBusy(true);
    setDetail("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not logged in");

      // remove from server
      const res = await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.message ?? j?.error ?? "Unsubscribe failed");
      }

      // optionally also remove browser subscription
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      setStatus("disabled");
    } catch (e: any) {
      setStatus("error");
      setDetail(e?.message ?? "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  const pill = (() => {
    const base =
      "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border";
    switch (status) {
      case "enabled":
        return <span className={`${base} border-emerald-500/30 bg-emerald-500/10`}>Enabled</span>;
      case "disabled":
        return <span className={`${base} border-zinc-500/30 bg-zinc-500/10`}>Disabled</span>;
      case "checking":
        return <span className={`${base} border-zinc-500/30 bg-zinc-500/10`}>Checking…</span>;
      case "unsupported":
        return (
          <span className={`${base} border-amber-500/30 bg-amber-500/10`}>Unsupported</span>
        );
      case "denied":
        return <span className={`${base} border-red-500/30 bg-red-500/10`}>Blocked</span>;
      case "error":
        return <span className={`${base} border-red-500/30 bg-red-500/10`}>Error</span>;
    }
  })();

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">Push notifications</div>
          <div className="text-sm opacity-70">Enable reminders and alerts on this device.</div>
        </div>
        {pill}
      </div>

      {status === "denied" && (
        <div className="text-sm">
          Notifications are blocked in your browser settings. Re-enable them for this site, then
          refresh.
        </div>
      )}

      {status === "unsupported" && (
        <div className="text-sm">Your browser/device doesn’t support push notifications for PWAs.</div>
      )}

      {status === "error" && detail && (
        <div className="text-sm text-red-600 dark:text-red-400 break-words">{detail}</div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          className="h-10 px-4 rounded-lg border hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
          onClick={fetchStatusFromServer}
          disabled={busy}
        >
          Refresh status
        </button>

        <button
          className="h-10 px-4 rounded-lg bg-black text-white dark:bg-white dark:text-black disabled:opacity-50"
          onClick={enablePush}
          disabled={busy || status === "enabled" || status === "unsupported" || status === "denied"}
        >
          Enable
        </button>

        <button
          className="h-10 px-4 rounded-lg border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
          onClick={disablePush}
          disabled={busy || status !== "enabled"}
        >
          Disable
        </button>
      </div>
    </div>
  );
}