"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function SignOutPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      await supabase.auth.signOut();
      router.replace("/login");
    })();
  }, [router]);

  return (
    <div className="max-w-md mx-auto p-6">
      <div className="text-lg font-semibold">Signing out…</div>
    </div>
  );
}