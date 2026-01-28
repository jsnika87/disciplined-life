import { supabase } from "@/lib/supabaseClient";

function arrayBufferToBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function getAccessTokenOrThrow() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not logged in.");
  return token;
}

export async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("Service workers not supported.");
  return await navigator.serviceWorker.register("/sw.js");
}

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) throw new Error("Notifications not supported.");
  return await Notification.requestPermission();
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

export async function subscribeToPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY.");

  const token = await getAccessTokenOrThrow();
  const reg = await ensureServiceWorker();

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

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ subscription: plain, userAgent: navigator.userAgent }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Subscribe failed: ${txt}`);
  }

  return sub;
}

export async function unsubscribeFromPush() {
  const token = await getAccessTokenOrThrow();

  const reg = await ensureServiceWorker();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  const res = await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Unsubscribe failed: ${txt}`);
  }

  await sub.unsubscribe();
}

export async function isPushEnabled() {
  const reg = await ensureServiceWorker();
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}