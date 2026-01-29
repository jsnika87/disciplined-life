import type { ReactNode } from "react";
import AppShell from "@/components/shell/AppShell";
import RequireApproved from "@/components/auth/RequireApproved";
import AppProviders from "./providers";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <ServiceWorkerRegister />
      <RequireApproved>
        <AppShell>{children}</AppShell>
      </RequireApproved>
    </AppProviders>
  );
}