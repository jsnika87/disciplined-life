"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AnyObj = Record<string, any>;

export default function DebugClient() {
  const [out, setOut] = useState<AnyObj>({ loading: true });
  const runIdRef = useRef(0);

  useEffect(() => {
    let isAlive = true;
    const myRunId = ++runIdRef.current;

    const safeSetOut = (next: AnyObj) => {
      if (!isAlive) return;
      if (runIdRef.current !== myRunId) return;
      setOut(next);
    };

    const withTimeout = async <T,>(
      fn: (signal: AbortSignal) => Promise<T>,
      ms: number,
      label: string
    ): Promise<T> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(label), ms);

      try {
        return await fn(controller.signal);
      } catch (e: any) {
        if (e?.name === "AbortError") {
          const msg = typeof e?.message === "string" ? e.message : "aborted";
          throw Object.assign(new Error(msg || `${label} aborted`), { name: "AbortError" });
        }
        throw e;
      } finally {
        clearTimeout(timeout);
      }
    };

    (async () => {
      const result: AnyObj = { loading: true };

      try {
        // --- Session ---
        try {
          const session = await withTimeout(
            async () => await supabase.auth.getSession(),
            8000,
            "supabase.auth.getSession timeout"
          );
          result.sessionUser = session.data.session?.user ?? null;
          result.sessionError = session.error ?? null;
        } catch (e: any) {
          result.sessionUser = null;
          result.sessionError = e?.message ?? String(e);
        }

        // --- Profile ---
        if (result.sessionUser?.id) {
          try {
            const prof = await withTimeout(
              async () =>
                await supabase
                  .schema("disciplined")
                  .from("profiles")
                  .select("id,email,role,approved,timezone,updated_at")
                  .eq("id", result.sessionUser.id)
                  .single(),
              8000,
              "profiles select timeout"
            );

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

        // --- service worker details (with timeouts) ---
        if ("serviceWorker" in navigator) {
          try {
            const reg = await withTimeout(
              async () => await navigator.serviceWorker.getRegistration(),
              5000,
              "getRegistration timeout"
            );

            result.serviceWorker = {
              scope: reg?.scope ?? null,
              activeScriptURL: (reg?.active && (reg.active as any).scriptURL) || null,
              waiting: !!reg?.waiting,
              installing: !!reg?.installing,
            };

            if (reg && "pushManager" in reg) {
              const sub = await withTimeout(
                async () => await reg.pushManager.getSubscription(),
                5000,
                "getSubscription timeout"
              );

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

        // --- Server push status (AUTHORIZED like PushSettingsClient) ---
        try {
          const { data } = await withTimeout(
            async () => await supabase.auth.getSession(),
            8000,
            "getSession for push status timeout"
          );
          const token = data.session?.access_token ?? null;

          const statusJson = await withTimeout(async (signal) => {
            const res = await fetch("/api/push/status", {
              method: "GET",
              cache: "no-store",
              headers: {
                accept: "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              signal,
            });

            const text = await res.text();
            let parsed: any = null;
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = { raw: text };
            }

            return { ok: res.ok, status: res.status, body: parsed, sentAuth: !!token };
          }, 8000, "push status fetch timeout");

          result.pushStatus = statusJson;
        } catch (e: any) {
          if (e?.name === "AbortError") {
            result.pushStatus = { ok: false, aborted: true, message: e?.message ?? "AbortError" };
          } else {
            result.pushStatus = { ok: false, error: e?.message ?? String(e) };
          }
        }
      } catch (e: any) {
        result.error = e?.message ?? String(e);
      }

      result.loading = false;
      safeSetOut(result);
    })();

    return () => {
      isAlive = false;
    };
  }, []);

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Debug</h1>

        <Link
          href="/settings"
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Back to Settings
        </Link>
      </div>

      <pre className="text-xs overflow-auto border rounded p-4">
        {JSON.stringify(out, null, 2)}
      </pre>
    </div>
  );
}