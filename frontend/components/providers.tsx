"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "@/lib/query-client"
import { SplashScreen } from "@/components/splash-screen"
import { ViewportProvider } from "@/mobile"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ViewportProvider>
        <SplashScreen />
        {children}
      </ViewportProvider>
    </QueryClientProvider>
  )
}
