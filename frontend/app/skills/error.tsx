"use client"

import { AppRouteError } from "@/components/errors/app-route-error"

export default function Error({ reset }: { reset: () => void }) {
  return <AppRouteError surface="app" title="Skills unavailable" reset={reset} />
}
