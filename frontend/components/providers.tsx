"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { queryClient } from "@/lib/query-client"
import { makePersistOptions } from "@/lib/query-persist"
import { ViewportProvider } from "@/mobile"
import { SignupModal } from "@/components/auth/signup-modal"
import { AttributionCapture } from "@/components/attribution-capture"

function Inner({ children }: { children: React.ReactNode }) {
  return (
    <ViewportProvider>
      <AttributionCapture />
      {children}
      {/* ADR-0006 §15 — global mount so any public or app surface can
          fire useSignupGate().open() without re-mounting infrastructure. */}
      <SignupModal />
    </ViewportProvider>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  // On the server there is no localStorage → plain provider. On the client we
  // wrap with persistence so a returning user rehydrates their last dashboard
  // before any fetch resolves (stale-while-revalidate). Both providers are
  // contextual (no DOM), so the server/client tree difference can't cause a
  // hydration mismatch.
  const persistOptions = makePersistOptions()
  if (!persistOptions) {
    return (
      <QueryClientProvider client={queryClient}>
        <Inner>{children}</Inner>
      </QueryClientProvider>
    )
  }
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <Inner>{children}</Inner>
    </PersistQueryClientProvider>
  )
}
