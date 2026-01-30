// public/sw.js

self.addEventListener("install", () => {
  // Do NOT skipWaiting on iOS PWAs; it can create mixed-version app state.
  // The new SW will activate after old tabs close naturally.
});

self.addEventListener("activate", (event) => {
  // Safe: once this SW activates, take control of clients immediately.
  // (We are NOT forcing activation early via skipWaiting.)
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Disciplined Life", body: "New notification" };
  }

  const title = data.title || "Disciplined Life";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/icon-192.png",
    data: data.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/today";

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })()
  );
});

self.addEventListener("pushsubscriptionchange", () => {
  // We'll re-subscribe from the client on next app open.
});