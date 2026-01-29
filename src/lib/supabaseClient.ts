// src/lib/supabaseClient.ts
import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    db: { schema: "disciplined" },
  });
}

// Back-compat export so existing imports keep working:
export const supabase = createSupabaseBrowserClient();