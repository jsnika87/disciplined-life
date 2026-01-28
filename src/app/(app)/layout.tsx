import type { ReactNode } from "react";
import AppShell from "@/components/shell/AppShell";
import RequireApproved from "@/components/auth/RequireApproved";
import AppProviders from "./providers";
import TimezoneSync from "@/components/auth/TimezoneSync";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <RequireApproved>
        <TimezoneSync />
        <AppShell>{children}</AppShell>
      </RequireApproved>
    </AppProviders>
  );
}