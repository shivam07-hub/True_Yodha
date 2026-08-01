"use client"

import { AppRouteError } from "@/components/errors/app-route-error"

/**
 * Error boundary for EVERY authed route.
 *
 * `app/jobs/error.tsx` and `app/skills/error.tsx` used to carry this, and
 * `route-error-boundaries.test.mjs` guarded them. Both routes then moved under
 * `app/(authed)/` without their boundaries; the test kept asserting the old
 * paths and went red, but it was never wired into CI, so nothing said so. The
 * `surface="app"` branch of AppRouteError has been unreachable ever since —
 * a render failure on any authed route fell through to Next's default screen
 * with no Retry.
 *
 * One boundary on the group segment covers all of them, and cannot be missed
 * off a new route the way a per-route file can.
 */
export default function Error({ reset }: { reset: () => void }) {
  return <AppRouteError surface="app" title="This page failed to load" reset={reset} />
}
