// Viewport — single source of truth for breakpoint values.
// CSS mirror lives in app/design-tokens.css as --tm-bp-mobile.
// When changing the breakpoint, update BOTH this file and the CSS token.

export const BREAKPOINT_MOBILE_MAX = 768

export const MEDIA_QUERY_DESKTOP = `(min-width: ${BREAKPOINT_MOBILE_MAX + 1}px) and (pointer: fine)`
export const MEDIA_QUERY_MOBILE = `(max-width: ${BREAKPOINT_MOBILE_MAX}px)`
export const MEDIA_QUERY_REDUCED_MOTION = "(prefers-reduced-motion: reduce)"
export const MEDIA_QUERY_POINTER_FINE = "(pointer: fine)"

export type ViewportMode = "mobile" | "desktop"
export type PointerKind = "fine" | "coarse"
