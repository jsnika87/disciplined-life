// public/sw.js

self.addEventListener("install", () => {
  // Do NOT skipWaiting on iOS PWAs; it can create mixed-version app state.
});

self.addEventListener("activate", (event) => {
  // Once activated, take control of clients immediately.
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
    data: data.data || {}, // expects { url: "/today" } etc.
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const raw = (event.notification.data && event.notification.data.url) || "/today";

  // IMPORTANT: Always open an absolute URL inside this SW's scope
  const targetUrl = new URL(raw, self.registration.scope).toString();

  event.waitUntil(
    (async () => {
      // Try to focus an existing window client
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Prefer any client that is already within our scope
      for (const client of allClients) {
        try {
          // If we have a client, focus it and navigate it
          if ("focus" in client) await client.focus();
          if ("navigate" in client) {
            await client.navigate(targetUrl);
          }
          return;
        } catch {
          // keep trying other clients
        }
      }

      // Otherwise open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});

self.addEventListener("pushsubscriptionchange", () => {
  // We'll re-subscribe from the client on next app open.
});