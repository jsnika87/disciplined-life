// src/lib/supabaseServer.ts
import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function createSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      async get(name: string) {
        const cookieStore = await cookies();
        return cookieStore.get(name)?.value;
      },
      // These are optional but recommended for auth flows.
      async set(name: string, value: string, options: any) {
        const cookieStore = await cookies();
        cookieStore.set({ name, value, ...options });
      },
      async remove(name: string, options: any) {
        const cookieStore = await cookies();
        cookieStore.set({ name, value: "", ...options, maxAge: 0 });
      },
    },
  });
}