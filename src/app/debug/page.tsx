// src/app/debug/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AnyObj = Record<string, any>;

export default function DebugPage() {
  const [out, setOut] = useState<AnyObj>({ loading: true });
  const runIdRef = useRef(0);

  useEffect(() => {
    let isAlive = true;
    const myRunId = ++runIdRef.current;

    const safeSetOut = (next: AnyObj) => {
      // Prevent setting state if we've unmounted or a newer run started
      if (!isAlive) return;
      if (runIdRef.current !== myRunId) return;
      setOut(next);
    };

    const withTimeout = async <T,>(fn: (signal: AbortSignal) => Promise<T>, ms: number) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), ms);

      try {
        return await fn(controller.signal);
      } finally {
        clearTimeout(timeout);
      }
    };

    (async () => {
      const result: AnyObj = { loading: true };
      try {
        // --- Session ---
        try {
          const session = await supabase.auth.getSession();
          result.sessionUser = session.data.session?.user ?? null;
          result.sessionError = session.error ?? null;
        } catch (e: any) {
          result.sessionUser = null;
          result.sessionError = e?.message ?? String(e);
        }

        // --- Profile ---
        if (result.sessionUser?.id) {
          try {
            const prof = await supabase
              .schema("disciplined")
              .from("profiles")
              .select("id,email,role,approved,timezone,updated_at")
              .eq("id", result.sessionUser.id)
              .single();

            result.profile = prof.data ?? null;
            result.profileError = prof.error ?? null;
          } catch (e: any) {
            result.profile = null;
            result.profileError = e?.message ?? String(e);
          }
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
          try {
            const reg = await navigator.serviceWorker.getRegistration();
            result.serviceWorker = {
              scope: reg?.scope ?? null,
              activeScriptURL: (reg?.active && (reg.active as any).scriptURL) || null,
              waiting: !!reg?.waiting,
              installing: !!reg?.installing,
            };

            if (reg && "pushManager" in reg) {
              const sub = await reg.pushManager.getSubscription();
              result.push.subscription = sub
                ? {
                    endpoint: sub.endpoint,
                    keysPresent: !!sub.toJSON()?.keys,
                  }
                : null;
            }
          } catch (e: any) {
            result.serviceWorker = { error: e?.message ?? String(e) };
          }
        } else {
          result.serviceWorker = { supported: false };
        }

        // --- Server push status (via app domain) ---
        // IMPORTANT: If the page unmounts, we abort this fetch, but we do NOT mark it as an error.
        try {
          const statusJson = await withTimeout(async (signal) => {
            const res = await fetch("/api/push/status", {
              method: "GET",
              cache: "no-store",
              headers: { "accept": "application/json" },
              signal,
            });

            // If your endpoint returns non-200, capture it cleanly
            const text = await res.text();
            let parsed: any = null;
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = { raw: text };
            }

            return { ok: res.ok, status: res.status, body: parsed };
          }, 10000);

          result.pushStatus = statusJson;
        } catch (e: any) {
          // If this was aborted due to timeout OR unmount, show it but don't fail the whole debug page.
          if (e?.name === "AbortError") {
            result.pushStatus = { ok: false, aborted: true, message: e?.message ?? "AbortError" };
          } else {
            result.pushStatus = { ok: false, error: e?.message ?? String(e) };
          }
        }
      } catch (e: any) {
        // Only truly unexpected errors land here
        result.error = e?.message ?? String(e);
      }

      result.loading = false;
      safeSetOut(result);
    })();

    return () => {
      // This prevents state update + avoids treating cleanup aborts as “real failures”
      isAlive = false;
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