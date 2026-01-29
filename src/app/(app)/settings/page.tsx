// src/app/(app)/settings/page.tsx
import Link from "next/link";
import PushSettingsClient from "./PushSettingsClient";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();

  // Who is the logged-in user?
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Default: not admin
  let isAdmin = false;

  if (user?.id) {
    // Pull role from profiles
    const { data: prof } = await supabase
      .schema("disciplined")
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    isAdmin = prof?.role === "admin";
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/* Existing push settings UI */}
      <PushSettingsClient />

      <div className="border rounded">
        <div className="px-4 py-3 border-b font-medium">Tools</div>

        <div className="p-2">
          {isAdmin ? (
            <Link
              href="/debug"
              className="block px-3 py-2 rounded hover:bg-black/5 dark:hover:bg-white/10"
            >
              Debug (admin)
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}