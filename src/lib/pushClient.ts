// src/lib/pushClient.ts
import { supabase } from "@/lib/supabaseClient";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function arrayBufferToBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function withTimeout<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  return await Promise.race([
    fn(),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

async function getAccessTokenOrThrow() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not logged in.");
  return token;
}

function isStandalonePWA() {
  const anyNav = navigator as any;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    anyNav?.standalone === true
  );
}

export async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("Service workers not supported.");

  // Prefer an existing registration if present (prevents iOS weirdness)
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;

  // Register your SW (public/sw.js => /sw.js)
  return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

async function ensureControlledPageOrThrow() {
  // Most reliable signal: SW is controlling this page
  if (navigator.serviceWorker.controller) return;

  if (!isStandalonePWA()) {
    throw new Error(
      "On iPhone, push works only after installing to Home Screen. Install it, then reopen the app."
    );
  }

  // iOS often needs an app reopen / reload to get controller set.
  // We wait briefly; if still not controlled, give a clear instruction.
  await withTimeout(2000, async () => {
    while (!navigator.serviceWorker.controller) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }).catch(() => {
    throw new Error(
      "Service worker isn’t controlling yet. Close the app and reopen it, then try enabling again."
    );
  });
}

function subscriptionToPlain(sub: PushSubscription) {
  const p256dhKey = sub.getKey("p256dh");
  const authKey = sub.getKey("auth");

  const p256dh = p256dhKey ? arrayBufferToBase64(p256dhKey) : "";
  const auth = authKey ? arrayBufferToBase64(authKey) : "";

  return {
    endpoint: sub.endpoint,
    keys: { p256dh, auth },
  };
}

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) throw new Error("Notifications not supported.");
  return await Notification.requestPermission();
}

export async function subscribeToPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY.");

  const token = await getAccessTokenOrThrow();

  await ensureServiceWorker();
  await ensureControlledPageOrThrow();

  const reg = await withTimeout(5000, async () => await navigator.serviceWorker.ready);

  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const plain = subscriptionToPlain(sub);
  if (!plain.endpoint || !plain.keys.p256dh || !plain.keys.auth) {
    throw new Error("Browser did not return push keys (p256dh/auth).");
  }

  const res = await withTimeout(8000, async () => {
    return await fetch("/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subscription: plain, userAgent: navigator.userAgent }),
    });
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Subscribe failed (${res.status}): ${txt || "Unknown error"}`);
  }

  return sub;
}

export async function unsubscribeFromPush() {
  const token = await getAccessTokenOrThrow();

  await ensureServiceWorker();
  const reg = await withTimeout(5000, async () => await navigator.serviceWorker.ready);

  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  const res = await withTimeout(8000, async () => {
    return await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Unsubscribe failed (${res.status}): ${txt || "Unknown error"}`);
  }

  await sub.unsubscribe();
}

export async function isPushEnabled() {
  await ensureServiceWorker();
  const reg = await withTimeout(5000, async () => await navigator.serviceWorker.ready);
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}