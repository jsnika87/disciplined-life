// src/app/(app)/layout.tsx
import type { ReactNode } from "react";
import AppShell from "@/components/shell/AppShell";
import AppProviders from "./providers";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <ServiceWorkerRegister />
      <AppShell>{children}</AppShell>
    </AppProviders>
  );
}