import { Skeleton } from "@/components/ui/skeleton"
import { SkeletonSkin } from "@/components/loading/skeleton-skin"
import { CVMobileHubSkeleton } from "@/components/loading/mobile-page-skeletons"

/**
 * The CV tab while it boots: the flow ribbon, the list of CVs, and the paper.
 * One button sits where Edit will. The old shape was a stats row and a commit
 * graph, which this page has not been for a long time.
 */
const LIST_WIDTHS = [88, 150, 132, 168, 120]

export function CVBaselineSkeleton() {
  return (
    <div className="tm-page-canvas tm-page-enter" aria-hidden="true">
      <SkeletonSkin
        mobile={<CVMobileHubSkeleton />}
        desktop={
          <div style={{ padding: "16px 28px 48px" }}>
            <Skeleton style={{ width: "100%", height: 44, borderRadius: 10, marginBottom: 20 }} />
            <div style={{
              display: "grid",
              gridTemplateColumns: "300px minmax(0, 1fr)",
              gap: 24,
              alignItems: "start",
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 6 }}>
                <Skeleton style={{ width: 64, height: 10, borderRadius: 4 }} />
                {LIST_WIDTHS.map((width) => (
                  <Skeleton key={width} style={{ width, height: 14, borderRadius: 4 }} />
                ))}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  marginBottom: 20,
                }}>
                  <Skeleton style={{ width: 96, height: 18, borderRadius: 4 }} />
                  <Skeleton style={{ width: 72, height: 36, borderRadius: 6 }} />
                </div>
                <div
                  className="cvb-pdf-page"
                  style={{ width: "100%", maxWidth: 816, minHeight: 720, margin: 0, padding: "40px 44px" }}
                >
                  <Skeleton style={{ width: 220, height: 28, borderRadius: 4, marginBottom: 10 }} />
                  <Skeleton style={{ width: 180, height: 12, borderRadius: 4, marginBottom: 28 }} />
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <Skeleton
                      key={i}
                      style={{ width: i % 3 === 2 ? "72%" : "100%", height: 12, borderRadius: 4, marginBottom: 10 }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        }
      />
    </div>
  )
}
