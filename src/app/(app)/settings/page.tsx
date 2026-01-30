// src/app/(app)/settings/page.tsx
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return <SettingsClient />;
}