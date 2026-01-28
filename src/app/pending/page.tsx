"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function PendingPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      setEmail(data.user.email ?? null);
    })();
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Awaiting approval</h1>
      <p className="text-sm opacity-80">
        Your account{email ? ` (${email})` : ""} has been created, but it must be approved by an
        admin before you can access the app.
      </p>

      <div className="p-4 border rounded space-y-2">
        <div className="font-medium">What you can do now</div>
        <ul className="list-disc pl-5 text-sm opacity-80 space-y-1">
          <li>Close the app and check back later.</li>
          <li>If you think this is a mistake, contact the admin.</li>
        </ul>
      </div>

      <button className="border rounded px-3 py-2" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}
