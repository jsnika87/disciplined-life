"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: "pending" | "user" | "admin";
  approved: boolean;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function routeBasedOnApproval(userId: string) {
    const { data: profile, error: profErr } = await supabase
      .schema("disciplined")
      .from("profiles")
      .select("id,email,display_name,role,approved")
      .eq("id", userId)
      .single<Profile>();

    // If anything is weird/missing, safest is pending
    if (profErr || !profile) {
      router.replace("/pending");
      return;
    }

    if (!profile.approved) {
      router.replace("/pending");
      return;
    }

    router.replace("/today");
  }

  // If already logged in, route to pending/today based on approval
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (userId) {
        await routeBasedOnApproval(userId);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInErr) throw signInErr;

      const userId = data.user?.id;
      if (!userId) throw new Error("Missing user id after login.");

      await routeBasedOnApproval(userId);
    } catch (err: any) {
      setError(err?.message ?? "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Log in</h1>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1">
          <label className="text-sm">Email</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm">Password</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <button disabled={busy} className="w-full border rounded px-3 py-2 font-medium">
          {busy ? "Signing in..." : "Log in"}
        </button>
      </form>

      <p className="text-sm">
        Need an account?{" "}
        <a className="underline" href="/signup">
          Create one
        </a>
      </p>

      <div className="pt-2">
        <button
          className="text-sm underline opacity-80"
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace("/login");
          }}
          type="button"
        >
          Sign out (if you’re already logged in)
        </button>
      </div>
    </div>
  );
}