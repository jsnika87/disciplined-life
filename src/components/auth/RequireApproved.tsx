"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type StatusResponse =
  | { ok: true; userId: string; role: "pending" | "user" | "admin"; approved: boolean; reason?: string }
  | { ok: false; reason: string; message?: string };

export default function RequireApproved({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    async function check() {
      setLoading(true);
      setAllowed(false);

      try {
        const res = await fetch("/api/profile/status", {
          method: "GET",
          cache: "no-store",
          signal: ac.signal,
        });

        if (res.status === 401) {
          if (!cancelled) router.replace("/login");
          return;
        }

        const data = (await res.json()) as StatusResponse;

        if (!data.ok) {
          // If we cannot verify, don't shove you to /pending blindly — just go to login
          // (keeps you from being stuck due to transient aborts)
          if (!cancelled) router.replace("/login");
          return;
        }

        if (!data.approved) {
          if (!cancelled) router.replace("/pending");
          return;
        }

        if (!cancelled) {
          setAllowed(true);
          setLoading(false);
        }
      } catch (e: any) {
        // If the fetch was aborted due to navigation, do nothing.
        if (e?.name === "AbortError") return;

        if (!cancelled) {
          // On unexpected errors, route to login (not pending)
          router.replace("/login");
        }
      }
    }

    check();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [router, pathname]);

  if (loading && !allowed) {
    return (
      <div className="max-w-md mx-auto p-6 space-y-2">
        <div className="text-lg font-semibold">Loading…</div>
        <div className="text-sm opacity-70">Checking your account status.</div>
      </div>
    );
  }

  if (!allowed) return null;

  return <>{children}</>;
}