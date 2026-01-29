// src/app/debug/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type DebugOut = Record<string, any>;

export default function DebugPage() {
  const [out, setOut] = useState<DebugOut>({ loading: true });

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    (async () => {
      const result: DebugOut = { loading: true };

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

        // --- Service Worker details ---
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

          // --- Server push status (through app routes) ---
          // IMPORTANT: this can get aborted on navigation/unmount; we handle it safely.
          try {
            const res = await fetch("/api/push/status", {
              method: "GET",
              cache: "no-store",
              signal: controller.signal,
              headers: { Accept: "application/json" },
            });

            const text = await res.text();
            let json: any = null;
            try {
              json = JSON.parse(text);
            } catch {
              // keep raw
            }

            result.pushStatus = {
              ok: res.ok,
              status: res.status,
              json,
              raw: json ? null : text,
            };
          } catch (err: any) {
            if (err?.name === "AbortError") {
              result.pushStatus = { aborted: true };
            } else {
              result.pushStatus = { error: String(err) };
            }
          }
        } else {
          result.serviceWorker = { supported: false };
        }
      } catch (err: any) {
        // AbortError is "normal" if iOS kills the request or you navigate away
        if (err?.name === "AbortError") {
          result.aborted = true;
        } else {
          result.error = err?.message ?? String(err);
        }
      } finally {
        result.loading = false;
        if (mounted) setOut(result);
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
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