// src/app/debug/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function DebugPage() {
  const [out, setOut] = useState<any>({ loading: true });

  useEffect(() => {
    (async () => {
      const result: any = {};
      try {
        // --- Session ---
        const session = await supabase.auth.getSession();
        result.sessionUser = session.data.session?.user ?? null;

        // --- Profile ---
        if (result.sessionUser?.id) {
          const prof = await supabase
            .schema("disciplined")
            .from("profiles")
            .select("id,email,role,approved,timezone,updated_at")
            .eq("id", result.sessionUser.id)
            .single();

          result.profile = prof.data ?? null;
          result.profileError = prof.error ?? null;
        }

        // --- PWA / Push diagnostics (client-only) ---
        const anyNav: any = navigator as any;

        result.pwa = {
          isStandalone:
            (window.matchMedia?.("(display-mode: standalone)")?.matches ?? false) ||
            anyNav?.standalone === true,
          displayModeStandalone:
            window.matchMedia?.("(display-mode: standalone)")?.matches ?? false,
          navigatorStandalone: anyNav?.standalone ?? null,
        };

        result.push = {
          supported:
            "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
          notificationPermission:
            typeof Notification !== "undefined" ? Notification.permission : "N/A",
          hasServiceWorkerController: !!navigator.serviceWorker?.controller,
        };

        // service worker details
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          result.serviceWorker = {
            scope: reg?.scope ?? null,
            activeScriptURL: (reg?.active && (reg.active as any).scriptURL) || null,
            waiting: !!reg?.waiting,
            installing: !!reg?.installing,
          };

          // subscription details (if supported)
          if (reg && "pushManager" in reg) {
            const sub = await reg.pushManager.getSubscription();
            result.push.subscription = sub
              ? {
                  endpoint: sub.endpoint,
                  keysPresent: !!sub.toJSON()?.keys,
                }
              : null;
          }
        } else {
          result.serviceWorker = { supported: false };
        }
      } catch (e: any) {
        result.error = e?.message ?? String(e);
      }

      result.loading = false;
      setOut(result);
    })();
  }, []);

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      <h1 className="text-xl font-semibold">Debug</h1>
      <pre className="text-xs overflow-auto border rounded p-4">
        {JSON.stringify(out, null, 2)}
      </pre>
    </div>
  );
}