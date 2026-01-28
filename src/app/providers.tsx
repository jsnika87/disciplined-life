// src/app/providers.tsx
"use client";

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let client: QueryClient | null = null;

function getQueryClient() {
  if (!client) {
    client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000, // 30s: reduces re-fetching while navigating
          gcTime: 5 * 60_000, // 5 min cache retention
          refetchOnWindowFocus: false,
          refetchOnReconnect: true,
          retry: 1,
        },
      },
    });
  }
  return client;
}

export default function Providers({ children }: { children: ReactNode }) {
  const qc = getQueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}