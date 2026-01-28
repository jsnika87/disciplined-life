"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const { error: signUpErr } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });

      if (signUpErr) throw signUpErr;

      // We route to login; after login, user will be Pending until admin approves.
      router.push("/login");
    } catch (err: any) {
      setError(err?.message ?? "Sign up failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Create account</h1>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1">
          <label className="text-sm">Display name (optional)</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Jay"
          />
        </div>

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
            minLength={8}
          />
          <p className="text-xs opacity-70">Minimum 8 characters.</p>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <button disabled={busy} className="w-full border rounded px-3 py-2 font-medium">
          {busy ? "Creating..." : "Create account"}
        </button>
      </form>

      <p className="text-sm">
        Already have an account?{" "}
        <a className="underline" href="/login">
          Log in
        </a>
      </p>
    </div>
  );
}