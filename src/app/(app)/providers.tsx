// src/app/(app)/providers.tsx
"use client";

import { ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export default function AppProviders({ children }: { children: ReactNode }) {
  // Create once per browser session (prevents cache resets on navigation)
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // ✅ makes back/forward navigation feel instant
            staleTime: 30_000, // 30s
            gcTime: 10 * 60_000, // 10 min
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}