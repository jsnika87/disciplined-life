// src/app/debug/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AnyObj = Record<string, any>;

function isAbortError(e: any) {
  return (
    e?.name === "AbortError" ||
    e?.code === "ABORT_ERR" ||
    String(e?.message || "").toLowerCase().includes("aborted")
  );
}

export default function DebugPage() {
  const [out, setOut] = useState<AnyObj>({ loading: true });

  useEffect(() => {
    let mounted = true;

    const safeSet = (patch: AnyObj) => {
      if (!mounted) return;
      setOut((prev) => ({ ...prev, ...patch }));
    };

    (async () => {
      const result: AnyObj = {};
      try {
        // --- Session ---
        const sessionRes = await supabase.auth.getSession();
        result.sessionUser = sessionRes.data.session?.user ?? null;

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
        } else {
          result.profile = null;
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
          userAgent: navigator.userAgent,
        };

        result.push = {
          supported:
            "serviceWorker" in navigator &&
            "PushManager" in window &&
            "Notification" in window,
          notificationPermission:
            typeof Notification !== "undefined" ? Notification.permission : "N/A",
          hasServiceWorkerController: !!navigator.serviceWorker?.controller,
        };

        // --- Service worker details ---
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          result.serviceWorker = {
            scope: reg?.scope ?? null,
            activeScriptURL: (reg?.active && (reg.active as any).scriptURL) || null,
            waiting: !!reg?.waiting,
            installing: !!reg?.installing,
            hasRegistration: !!reg,
          };

          // --- Subscription details (if supported) ---
          if (reg && "pushManager" in reg) {
            const sub = await reg.pushManager.getSubscription();
            result.push.subscription = sub
              ? {
                  endpoint: sub.endpoint,
                  keysPresent: !!sub.toJSON()?.keys,
                }
              : null;
          } else {
            result.push.subscription = null;
          }
        } else {
          result.serviceWorker = { supported: false };
          result.push.subscription = null;
        }

        // --- Fetch server push status (must include cookies/session) ---
        // No AbortController here — iOS/Safari can throw AbortError unexpectedly.
        try {
          const r = await fetch("/api/push/status", {
            method: "GET",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
          });

          const text = await r.text();
          let json: any = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = { raw: text };
          }

          result.pushStatus = {
            ok: r.ok,
            status: r.status,
            body: json,
          };
        } catch (e: any) {
          result.pushStatusError = {
            name: e?.name ?? null,
            message: e?.message ?? String(e),
            aborted: isAbortError(e),
          };
        }
      } catch (e: any) {
        // If anything aborts mid-flight, do NOT wipe what we have.
        if (isAbortError(e)) {
          result.aborted = true;
          result.abortMessage = e?.message ?? String(e);
        } else {
          result.error = e?.message ?? String(e);
          result.errorName = e?.name ?? null;
        }
      }

      result.loading = false;
      safeSet(result);
    })();

    return () => {
      mounted = false;
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