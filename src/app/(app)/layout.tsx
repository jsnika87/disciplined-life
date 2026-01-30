// src/app/(app)/layout.tsx
import type { ReactNode } from "react";
import AppShell from "@/components/shell/AppShell";
import AppProviders from "./providers";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";
import ResumeFix from "@/components/pwa/ResumeFix";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <ServiceWorkerRegister />
      <ResumeFix />
      <AppShell>{children}</AppShell>
    </AppProviders>
  );
}