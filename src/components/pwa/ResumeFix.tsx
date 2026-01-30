"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * iOS PWA can suspend JS when you switch apps.
 * When you come back, "loading" UI can get stuck.
 *
 * This component:
 *  - broadcasts a resume event so any loading overlay can clear
 *  - optionally calls router.refresh() to re-sync RSC/auth state
 */
export default function ResumeFix() {
  const router = useRouter();

  useEffect(() => {
    let lastRefreshAt = 0;

    const broadcastResume = () => {
      window.dispatchEvent(new Event("dl:pwa-resume"));
    };

    const maybeRefresh = () => {
      // throttle: don't spam refresh if multiple events fire
      const now = Date.now();
      if (now - lastRefreshAt < 2000) return;
      lastRefreshAt = now;

      // refresh server components / data that can go stale on resume
      router.refresh();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        broadcastResume();
        maybeRefresh();
      }
    };

    const onFocus = () => {
      broadcastResume();
      maybeRefresh();
    };

    const onPageShow = (e: PageTransitionEvent) => {
      // pageshow fires on bfcache restore; persisted is a strong hint
      if ((e as any).persisted) {
        broadcastResume();
        maybeRefresh();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);

    // Also broadcast once after mount (helps first open edge cases)
    broadcastResume();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  return null;
}