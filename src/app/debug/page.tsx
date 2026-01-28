"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function DebugPage() {
  const [out, setOut] = useState<any>({ loading: true });

  useEffect(() => {
    (async () => {
      const result: any = {};
      const session = await supabase.auth.getSession();
      result.sessionUser = session.data.session?.user ?? null;

      if (result.sessionUser?.id) {
        const prof = await supabase
          .schema("disciplined")
          .from("profiles")
          .select("id,email,role,approved")
          .eq("id", result.sessionUser.id)
          .single();

        result.profile = prof.data ?? null;
        result.profileError = prof.error ?? null;
      }

      result.loading = false;
      setOut(result);
    })();
  }, []);

  return (
    <pre className="p-4 text-xs overflow-auto border rounded max-w-3xl mx-auto">
      {JSON.stringify(out, null, 2)}
    </pre>
  );
}