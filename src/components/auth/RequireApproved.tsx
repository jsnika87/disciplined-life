"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type StatusResponse =
  | {
      ok: true;
      userId: string;
      role: "pending" | "user" | "admin";
      approved: boolean;
      reason?: string;
    }
  | { ok: false; reason: string; message?: string };

async function fetchWithTimeout(input: RequestInfo, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

export default function RequireApproved({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [errorHint, setErrorHint] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      setLoading(true);
      setAllowed(false);
      setErrorHint("");

      try {
        const res = await fetchWithTimeout(
          "/api/profile/status",
          { method: "GET", cache: "no-store" },
          8000
        );

        if (cancelled) return;

        if (res.status === 401) {
          router.replace("/login");
          return;
        }

        const data = (await res.json()) as StatusResponse;

        if (!data.ok) {
          // Timeout or transient server error: don’t brick; bounce to login.
          setErrorHint(data.reason || "Unable to verify session");
          router.replace("/login");
          return;
        }

        if (!data.approved) {
          router.replace("/pending");
          return;
        }

        setAllowed(true);
      } catch (e: any) {
        if (cancelled) return;

        // AbortError (timeout) or network hiccup: don’t brick
        setErrorHint(e?.name === "AbortError" ? "Request timed out" : (e?.message ?? "Unknown error"));
        router.replace("/login");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  if (loading && !allowed) {
    return (
      <div className="max-w-md mx-auto p-6 space-y-3">
        <div className="text-lg font-semibold">Loading…</div>
        <div className="text-sm opacity-70">Checking your account status.</div>

        {errorHint ? (
          <div className="text-sm opacity-70">
            {errorHint}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => router.replace("/login")}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          Go to Login
        </button>
      </div>
    );
  }

  if (!allowed) return null;
  return <>{children}</>;
}