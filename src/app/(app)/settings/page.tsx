// src/app/(app)/settings/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import PushSettingsClient from "./PushSettingsClient";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export default async function SettingsPage() {
  // If you don’t need server auth checks here, you can delete these 2 lines.
  // Keeping it is fine if you want the server session available later.
  createSupabaseServerClient();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <PushSettingsClient />

      <div className="border rounded-xl p-4 space-y-2">
        <div className="font-semibold">Account</div>
        <div className="text-sm opacity-70">Manage your session and preferences.</div>

        <div className="pt-2">
          <Link className="underline" href="/settings/signout">
            Sign out
          </Link>
        </div>
      </div>

      <div className="border rounded-xl p-4 space-y-2">
        <div className="font-semibold">Preferences (placeholder)</div>
        <div className="text-sm opacity-70">
          Coming next: preferred Bible version, fasting window defaults, notification preferences,
          optional weight tracking.
        </div>
      </div>
    </div>
  );
}