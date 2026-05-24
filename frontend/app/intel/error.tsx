"use client"

import { AppRouteError } from "@/components/errors/app-route-error"

export default function Error({ reset }: { reset: () => void }) {
  return <AppRouteError surface="public" title="Intel unavailable" reset={reset} />
}
