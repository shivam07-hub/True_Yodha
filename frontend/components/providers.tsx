"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "@/lib/query-client"
import { ViewportProvider } from "@/mobile"
import { SignupModal } from "@/components/auth/signup-modal"
import { AttributionCapture } from "@/components/attribution-capture"
import { ServiceWorkerRegister } from "@/components/pwa/sw-register"
import { CVUploadLifecycleRoot } from "@/components/cv/cv-upload-lifecycle-observer"
import { LightFieldDriver } from "@/components/theme/light-field-driver"
import { useIsAndroidApp } from "@/lib/platform/use-android-app"

function Inner({ children }: { children: React.ReactNode }) {
  return (
    <ViewportProvider>
      <AttributionCapture />
      <AppShellCapture />
      <ServiceWorkerRegister />
      <CVUploadLifecycleRoot />
      <LightFieldDriver />
      {children}
      {/* ADR-0006 §15 — global mount so any public or app surface can
          fire useSignupGate().open() without re-mounting infrastructure. */}
      <SignupModal />
    </ViewportProvider>
  )
}

function AppShellCapture() {
  useIsAndroidApp()
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Inner>{children}</Inner>
    </QueryClientProvider>
  )
}
