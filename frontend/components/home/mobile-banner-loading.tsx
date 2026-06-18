import "./mobile-banner.css"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Loading shape for <MobileBanner>, co-located beside it. Reuses the real `mb`
 * row so the live stat strip lands in place with no reflow. Decorative only.
 */
export function MobileBannerLoading() {
  return (
    <div className="mb" aria-hidden="true">
      <Skeleton style={{ width: 72, height: 16, borderRadius: 6 }} />
      <Skeleton style={{ width: 40, height: 16, borderRadius: 6 }} />
      <Skeleton style={{ width: 86, height: 16, borderRadius: 6 }} />
    </div>
  )
}
