export { FeedbackHub } from "./feedback-hub"
export type { FeedbackHubProps } from "./feedback-hub"
export { FeedbackFAB } from "./feedback-fab"
export { CategoryGlyph } from "./category-glyph"
export {
  CATEGORIES,
  CATEGORY_ORDER,
  OPEN_FEEDBACK_EVENT,
  type FeedbackCategory,
  type OpenFeedbackDetail,
} from "./feedback-types"

/**
 * Dispatch this from anywhere to open the global Feedback Hub.
 * `AppShell` mounts a single listener and renders the hub.
 *
 * Lives in this module (not in `app-shell.tsx`) so settings-modal and other
 * leaf components can call it without an upward import cycle.
 */
import { OPEN_FEEDBACK_EVENT as _EVT } from "./feedback-types"
import type { OpenFeedbackDetail as _Detail } from "./feedback-types"
export function openFeedbackHub(detail: _Detail = {}) {
  if (typeof document === "undefined") return
  document.dispatchEvent(new CustomEvent<_Detail>(_EVT, { detail }))
}
