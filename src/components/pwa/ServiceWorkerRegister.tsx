"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    (async () => {
      try {
        // Register SW at root scope so it can control all routes
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

        // Ensure it activates ASAP
        await navigator.serviceWorker.ready;

        // iOS PWA sometimes launches without a controller until a reload
        if (!navigator.serviceWorker.controller) {
          const key = "__sw_reloaded_once__";
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, "1");
            window.location.reload();
          }
        }

        // Optional: keep SW fresh
        reg.update?.();
      } catch (err) {
        // Don’t crash the app if SW registration fails
        console.warn("SW register failed", err);
      }
    })();
  }, []);

  return null;
}