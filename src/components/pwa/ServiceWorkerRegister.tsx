"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Don’t try to be clever in iOS PWAs — reloading here causes “bricks”.
    // Just register, then let the app run even if controller is temporarily null.
    (async () => {
      try {
        // Register SW at root scope so it can control all routes
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

        // Ask browser to check for updates (safe)
        try {
          await reg.update?.();
        } catch {
          // ignore
        }

        // OPTIONAL: log controller acquisition (no reload)
        if (!navigator.serviceWorker.controller) {
          const onChange = () => {
            navigator.serviceWorker.removeEventListener("controllerchange", onChange);
            // At this point the page is controlled; no action needed.
          };
          navigator.serviceWorker.addEventListener("controllerchange", onChange);
        }
      } catch (err) {
        // Don’t crash the app if SW registration fails
        console.warn("SW register failed", err);
      }
    })();
  }, []);

  return null;
}