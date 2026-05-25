"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "@/lib/query-client"
import { SplashScreen } from "@/components/splash-screen"
import { ViewportProvider } from "@/mobile"
import { SignupModal } from "@/components/auth/signup-modal"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ViewportProvider>
        <SplashScreen />
        {children}
        {/* ADR-0006 §15 — global mount so any public or app surface can
            fire useSignupGate().open() without re-mounting infrastructure. */}
        <SignupModal />
      </ViewportProvider>
    </QueryClientProvider>
  )
}
