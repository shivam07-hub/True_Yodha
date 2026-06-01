import "./mobile-banner.css"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Loading shape for <MobileBanner>, co-located beside it (grill Q13). Reuses the
 * real `mb-*` classes so the live banner lands in place with no reflow.
 * Decorative only; aria-hidden.
 */
export function MobileBannerLoading() {
  return (
    <div className="mb" aria-hidden="true">
      <div className="mb-top">
        <Skeleton style={{ width: 180, height: 18, borderRadius: 6 }} />
        <div className="mb-stats">
          <Skeleton style={{ width: 44, height: 24, borderRadius: 999 }} />
          <Skeleton style={{ width: 52, height: 24, borderRadius: 999 }} />
        </div>
      </div>
    </div>
  )
}
