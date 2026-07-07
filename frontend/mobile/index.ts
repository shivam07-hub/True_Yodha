// Mobile module barrel — single import surface for all mobile/viewport concerns.
// Prerequisite for future packages/mobile-shared/ extraction (web PWA + Expo native).

export {
  BREAKPOINT_MOBILE_MAX,
  MEDIA_QUERY_DESKTOP,
  MEDIA_QUERY_MOBILE,
  MEDIA_QUERY_POINTER_FINE,
  MEDIA_QUERY_REDUCED_MOTION,
  type PointerKind,
  type ViewportMode,
} from "./viewport"

export { ViewportProvider, useViewport, type ViewportState } from "./provider"

export {
  AppShellSkeleton,
  MobileBottomNav,
  MobileTopBar,
} from "./shell"

export { MobileUIProvider, useMobileUI, useSnack, type SnackSpec } from "./redesign/mobile-ui"
export { PracticeSheet } from "./redesign/practice-sheet"
