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
  | { ok: true; userId: string; role: "pending" | "user" | "admin"; approved: boolean; email?: string | null }
  | { ok: false; reason: string; message?: string };

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Prevent redirect storms (Safari)
  const redirectingRef = useRef(false);
  const lastRedirectAtRef = useRef<number>(0);

  // Avoid overlapping init calls (iOS resume can fire multiple events)
  const initInFlightRef = useRef(false);
  const lastInitAtRef = useRef<number>(0);

  // Safety net: don’t let Loading… hang forever
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function beginLoading() {
    setLoading(true);

    if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    loadingTimeoutRef.current = setTimeout(() => {
      // If something got stuck (iOS resume), force UI back
      setLoading(false);
    }, 12000);
  }

  function endLoading() {
    setLoading(false);
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  }

  async function fetchStatusWithTimeout(ms = 8000): Promise<StatusResponse> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);

    try {
      const res = await fetch("/api/profile/status", {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });

      if (res.status === 401) return { ok: false, reason: "not_authenticated" };
      return (await res.json()) as StatusResponse;
    } catch (e: any) {
      if (e?.name === "AbortError") return { ok: false, reason: "timeout" };
      return { ok: false, reason: "network_error", message: e?.message ?? String(e) };
    } finally {
      clearTimeout(t);
    }
  }

  async function initAuthAndProfile() {
    // throttle to avoid repeated calls from resume events
    const now = Date.now();
    if (initInFlightRef.current) return;
    if (now - lastInitAtRef.current < 1500) return;

    initInFlightRef.current = true;
    lastInitAtRef.current = now;

    beginLoading();

    try {
      // 1) Session
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!session) {
        setSessionUserId(null);
        setProfile(null);
        endLoading();

        if (!isAuthRoute) safeReplace("/login");
        return;
      }

      setSessionUserId(session.user.id);

      // 2) Profile status (ONE network hit per app start / auth change / resume)
      const status = await fetchStatusWithTimeout(8000);

      if (!status.ok) {
        // If we can’t confirm status, route to login (NOT pending)
        setProfile(null);
        endLoading();
        if (!isAuthRoute) safeReplace("/login");
        return;
      }

      const p: Profile = {
        id: status.userId,
        email: status.email ?? session.user.email ?? null,
        display_name: null,
        role: status.role,
        approved: status.approved,
      };

      setProfile(p);
      endLoading();

      // Forward away from auth pages if already authed
      if (pathname === "/login" || pathname === "/signup") {
        if (!p.approved) safeReplace("/pending");
        else safeReplace("/today");
        return;
      }

      if (!p.approved && pathname !== "/pending") {
        safeReplace("/pending");
      }
    } finally {
      initInFlightRef.current = false;
      // ensure we never stay stuck
      endLoading();
    }
  }

  // Initial load + auth changes
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await initAuthAndProfile();
      } finally {
        if (!cancelled) endLoading();
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      try {
        await initAuthAndProfile();
      } catch {
        // ignore
      }
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resume handler (iOS PWA app switching)
  useEffect(() => {
    const onResume = () => {
      // Always clear any stuck loader immediately
      endLoading();

      // Re-check auth/profile (throttled inside)
      // This prevents stale session/profile state after iOS suspension
      void initAuthAndProfile();
    };

    window.addEventListener("dl:pwa-resume", onResume);
    return () => window.removeEventListener("dl:pwa-resume", onResume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, isAuthRoute]);

  // Lightweight route-guard on navigation (NO fetch)
  useEffect(() => {
    if (loading) return;

    // Not logged in → must be on auth route
    if (!sessionUserId) {
      if (!isAuthRoute) safeReplace("/login");
      return;
    }

    // Logged in but no profile (transient) → avoid loops; let init handle
    if (!profile) return;

    // Not approved → go pending
    if (!profile.approved) {
      if (pathname !== "/pending") safeReplace("/pending");
      return;
    }

    // Approved → don’t hang out on login/signup/pending
    if (pathname === "/login" || pathname === "/signup" || pathname === "/pending") {
      safeReplace("/today");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, loading, sessionUserId, profile?.approved]);

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
    return <div className="min-h-[60vh] flex items-center justify-center text-sm opacity-70">Loading…</div>;
  }

  if (!showChrome) return <>{children}</>;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <div className="font-semibold tracking-tight">Disciplined Life</div>

          <div className="flex items-center gap-3">
            {profile?.role ? (
              <span className="text-sm opacity-80">{profile.role === "admin" ? "Admin" : "User"}</span>
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