import { RouteMatchedSkeleton } from "@/components/loading/route-matched-skeleton"

// Renders INSIDE the persistent AppShell — chrome stays put; only the content
// region shows the destination page's skeleton shape during brief nav waits.
export default function AuthedLoading() {
  return <RouteMatchedSkeleton />
}
