"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ensureUserSettings } from "@/lib/ensureUserSettings";

type Status = "checking" | "enabled" | "disabled" | "unsupported" | "denied" | "error";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function waitForController(timeoutMs = 6000) {
  if (navigator.serviceWorker.controller) return true;

  return await new Promise<boolean>((resolve) => {
    const t = setTimeout(() => {
      cleanup();
      resolve(!!navigator.serviceWorker.controller);
    }, timeoutMs);

    function cleanup() {
      clearTimeout(t);
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
    }

    function onChange() {
      cleanup();
      resolve(true);
    }

    navigator.serviceWorker.addEventListener("controllerchange", onChange);
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

  async function getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function fetchStatusFromServer() {
    const token = await getAccessToken();
    if (!token) {
      setStatus("disabled");
      return;
    }

    const res = await fetch("/api/push/status", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const json = await res.json().catch(() => ({}));
    setStatus(json?.subscribed ? "enabled" : "disabled");
  }

  // ensure settings row (never bricks)
  useEffect(() => {
    ensureUserSettings().catch(() => {});
  }, []);

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

    const anyNav = navigator as any;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
      anyNav?.standalone === true;

    if (!standalone) {
      setStatus("error");
      setDetail(
        "On iPhone, push works only after installing to Home Screen. Install it, reopen, then try Enable."
      );
      return;
    }

    setBusy(true);
    setDetail("");

    try {
      const reg = await navigator.serviceWorker.ready;

      // Ask browser to check for updated SW (helps after deploy)
      try {
        await reg.update();
      } catch {
        // ignore
      }

      const controlled = await waitForController(6000);
      if (!controlled) {
        setStatus("error");
        setDetail("Service worker isn’t controlling yet. Close the PWA completely, reopen, then tap Enable again.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "disabled");
        return;
      }

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

      const token = await getAccessToken();
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
        throw new Error(j?.error ?? j?.reason ?? "Subscribe failed");
      }

      setStatus("enabled");
      setDetail("Enabled. (No reload — iOS PWAs can brick on forced reloads.)");
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
      const token = await getAccessToken();
      if (!token) throw new Error("Not logged in");

      // remove from server
      const res = await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? j?.reason ?? "Unsubscribe failed");
      }

      // remove browser subscription too
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      setStatus("disabled");
      setDetail("Disabled. (No reload — avoids Next Server Action mismatch.)");
    } catch (e: any) {
      setStatus("error");
      setDetail(e?.message ?? "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  const statusLabel =
    status === "checking"
      ? "Checking…"
      : status === "enabled"
        ? "Enabled"
        : status === "disabled"
          ? "Disabled"
          : status === "unsupported"
            ? "Unsupported"
            : status === "denied"
              ? "Denied"
              : "Error";

  return (
    <div className="border rounded p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">Push notifications</div>
          <div className="text-sm opacity-70">Enable reminders and alerts on this device.</div>
        </div>
        <div className="text-sm px-3 py-1 rounded-full border">{statusLabel}</div>
      </div>

      {detail ? <div className="text-sm text-red-400">{detail}</div> : null}

      <div className="flex gap-2">
        <button
          className="border rounded px-3 py-2 text-sm"
          onClick={fetchStatusFromServer}
          disabled={busy || status === "unsupported"}
        >
          Refresh status
        </button>

        <button
          className="border rounded px-3 py-2 text-sm"
          onClick={enablePush}
          disabled={busy || status === "unsupported" || status === "denied"}
        >
          Enable
        </button>

        <button
          className="border rounded px-3 py-2 text-sm"
          onClick={disablePush}
          disabled={busy || status === "unsupported"}
        >
          Disable
        </button>
      </div>
    </div>
  );
}