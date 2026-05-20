import type { ReactNode } from "react"
import { AppDataLoading } from "./route-loading.app-data"
import { FlowStepLoading } from "./route-loading.flow-step"
import type { ProcessLoadingStage } from "@/components/loading/process-loading"

type AppDataProps = {
  kind: "app-data"
  route?: string
  queryError?: unknown
  fallback?: ReactNode
  onRetry?: () => void
}

type FlowStepProps = {
  kind: "flow-step"
  step?: string
  message?: string
  stages?: readonly ProcessLoadingStage[]
}

export type RouteLoadingProps = AppDataProps | FlowStepProps

export function RouteLoading(props: RouteLoadingProps) {
  if (props.kind === "flow-step") {
    return <FlowStepLoading step={props.step} message={props.message} stages={props.stages} />
  }
  return (
    <AppDataLoading
      route={props.route}
      queryError={props.queryError}
      fallback={props.fallback}
      onRetry={props.onRetry}
    />
  )
}

// Re-export hooks for layout.tsx and page-level use
export { useBackendStatus } from "./use-backend-status"
export { useAppVersionWatch } from "./use-app-version-watch"
export { useRoutePerfMarks } from "./use-route-perf-marks"
export type { BackendStatus } from "./use-backend-status"
