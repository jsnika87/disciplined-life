import type { ReactNode } from "react";
import AppShell from "@/components/shell/AppShell";
import RequireApproved from "@/components/auth/RequireApproved";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireApproved>
      <AppShell>{children}</AppShell>
    </RequireApproved>
  );
}