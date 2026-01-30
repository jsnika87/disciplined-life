"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: "pending" | "user" | "admin";
  approved: boolean;
};

type NavItem = {
  href: string;
  label: string;
  icon: string;
  requiresAdmin?: boolean;
};

type StatusResponse =
  | {
      ok: true;
      userId: string;
      role: "pending" | "user" | "admin";
      approved: boolean;
      email?: string | null;
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

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadHint, setLoadHint] = useState<string>("");

  // Prevent redirect storms (Safari)
  const redirectingRef = useRef(false);
  const lastRedirectAtRef = useRef<number>(0);

  const isAuthRoute = useMemo(() => {
    return pathname === "/login" || pathname === "/signup" || pathname === "/pending";
  }, [pathname]);

  const showChrome = useMemo(() => !isAuthRoute, [isAuthRoute]);

  function safeReplace(to: string) {
    if (redirectingRef.current) return;
    if (pathname === to) return;

    const now = Date.now();
    if (now - lastRedirectAtRef.current < 800) return;

    redirectingRef.current = true;
    lastRedirectAtRef.current = now;

    router.replace(to);

    setTimeout(() => {
      redirectingRef.current = false;
    }, 1000);
  }

  async function fetchStatus(): Promise<StatusResponse> {
    try {
      const res = await fetchWithTimeout(
        "/api/profile/status",
        { method: "GET", cache: "no-store" },
        8000
      );

      if (res.status === 401) return { ok: false, reason: "not_authenticated" };

      const data = (await res.json()) as StatusResponse;
      return data;
    } catch (e: any) {
      if (e?.name === "AbortError") return { ok: false, reason: "timeout" };
      return { ok: false, reason: "network_error", message: e?.message ?? String(e) };
    }
  }

  async function evaluateAndRoute() {
    setLoadHint("");

    // Session fetch can hang on iOS reloads; keep it bounded
    let session: any = null;
    try {
      const sessionPromise = supabase.auth.getSession();
      session = await Promise.race([
        sessionPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
      ]);
    } catch {
      session = null;
    }

    const sessionData = session?.data?.session ?? null;

    if (!sessionData) {
      setSessionUserId(null);
      setProfile(null);
      if (!isAuthRoute) safeReplace("/login");
      return;
    }

    const userId = sessionData.user.id;
    setSessionUserId(userId);

    const status = await fetchStatus();

    if (!status.ok) {
      // If we can’t confirm status, route to login (NOT pending)
      setLoadHint(status.reason === "timeout" ? "Server check timed out" : "Could not verify session");
      if (!isAuthRoute) safeReplace("/login");
      setProfile(null);
      return;
    }

    const p: Profile = {
      id: status.userId,
      email: status.email ?? sessionData.user.email ?? null,
      display_name: null,
      role: status.role,
      approved: status.approved,
    };

    setProfile(p);

    // If they’re on /login or /signup, forward them based on approval
    if (pathname === "/login" || pathname === "/signup") {
      if (!p.approved) safeReplace("/pending");
      else safeReplace("/today");
      return;
    }

    // For other routes, ensure approved
    if (!p.approved) {
      if (pathname !== "/pending") safeReplace("/pending");
      return;
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await evaluateAndRoute();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      try {
        await evaluateAndRoute();
      } catch {
        // ignore
      }
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      setProfile(null);
      setSessionUserId(null);
      safeReplace("/login");
    }
  }

  const navItems: NavItem[] = useMemo(
    () => [
      { href: "/today", label: "Today", icon: "🏠" },
      { href: "/train", label: "Train", icon: "🏋️" },
      { href: "/eat", label: "Eat", icon: "🍽️" },
      { href: "/word", label: "Word", icon: "📖" },
      { href: "/freedom", label: "Freedom", icon: "🛡️" },
      { href: "/settings", label: "Settings", icon: "⚙️" },
      { href: "/admin", label: "Admin", icon: "🧰", requiresAdmin: true },
    ],
    []
  );

  const allowedNav = useMemo(() => {
    return navItems.filter((i) => {
      if (!i.requiresAdmin) return true;
      return profile?.role === "admin";
    });
  }, [navItems, profile?.role]);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-sm opacity-70 gap-3">
        <div>Loading…</div>
        {loadHint ? <div className="text-xs opacity-70">{loadHint}</div> : null}
        <button
          type="button"
          onClick={() => router.replace("/login")}
          className="rounded-lg border px-3 py-2 text-sm opacity-90"
        >
          Go to Login
        </button>
      </div>
    );
  }

  if (!showChrome) return <>{children}</>;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <div className="font-semibold tracking-tight">Disciplined Life</div>

          <div className="flex items-center gap-3">
            {profile?.role ? (
              <span className="text-sm opacity-80">
                {profile.role === "admin" ? "Admin" : "User"}
              </span>
            ) : null}

            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6 pb-24">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-5xl px-2 py-2">
          <div className="grid grid-cols-6 gap-1">
            {allowedNav
              .filter((i) => i.href !== "/admin")
              .slice(0, 6)
              .map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "rounded-xl border px-2 py-2 text-center",
                      "flex flex-col items-center justify-center gap-1",
                      active ? "bg-muted font-semibold" : "hover:bg-muted/60",
                    ].join(" ")}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="text-lg leading-none" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="text-xs leading-none">{item.label}</span>
                  </Link>
                );
              })}
          </div>

          {profile?.role === "admin" ? (
            <div className="pt-2">
              <Link
                href="/admin/approvals"
                className={[
                  "w-full rounded-xl border px-3 py-2 text-sm",
                  "flex items-center justify-center gap-2",
                  isActive("/admin/approvals") ? "bg-muted font-semibold" : "hover:bg-muted/60",
                ].join(" ")}
              >
                <span aria-hidden="true">🧰</span>
                <span>Admin approvals</span>
              </Link>
            </div>
          ) : null}
        </div>
      </nav>
    </div>
  );
}