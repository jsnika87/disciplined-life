"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { usePathname, useRouter } from "next/navigation";

type Profile = {
  id: string;
  role: "pending" | "user" | "admin";
  approved: boolean;
};

export default function RequireApproved({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      setLoading(true);
      setAllowed(false);

      const { data: userData } = await supabase.auth.getUser();

      // Not logged in -> login
      if (!userData.user) {
        if (!cancelled) router.replace("/login");
        return;
      }

      // Look up approval status in disciplined.profiles
      const { data: profile, error } = await supabase
        .schema("disciplined")
        .from("profiles")
        .select("id,role,approved")
        .eq("id", userData.user.id)
        .single<Profile>();

      if (error || !profile) {
        // If profile row is missing, treat as pending (safer default)
        if (!cancelled) router.replace("/pending");
        return;
      }

      if (!profile.approved) {
        if (!cancelled) router.replace("/pending");
        return;
      }

      // Approved -> allow
      if (!cancelled) {
        setAllowed(true);
        setLoading(false);
      }
    }

    check();

    // Also re-check when route changes (helps if they navigate fast)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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