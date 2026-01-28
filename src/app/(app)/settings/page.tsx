// src/app/(app)/settings/page.tsx
import Link from "next/link";
import PushSettingsClient from "./PushSettingsClient";

export default function SettingsPage() {
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