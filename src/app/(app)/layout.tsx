// src/app/(app)/layout.tsx
import type { ReactNode } from "react";
import AppShell from "@/components/shell/AppShell";
import RequireApproved from "@/components/auth/RequireApproved";
import AppProviders from "./providers";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <RequireApproved>
        <AppShell>{children}</AppShell>
      </RequireApproved>
    </AppProviders>
  );
}