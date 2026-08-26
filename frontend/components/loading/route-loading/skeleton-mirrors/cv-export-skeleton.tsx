import { Skeleton } from "@/components/ui/skeleton"

/**
 * /cv/export — the full-page tailored document, not the workstation.
 *
 * This shape used to live in page-skeletons as `CvSkeleton` and was painted for
 * the whole `/cv` segment, which is how it ended up flashing in front of the
 * baseline library and the workstation as well. It is only ever the export
 * page's mirror now: a page head and one tall document card, which is what
 * `cvb-export-fullpage` renders.
 */
export function CVExportSkeleton() {
  return (
    <div className="cvb-scope" aria-hidden="true" style={{ overflowY: "auto", height: "100%" }}>
      <div className="cvb-page" style={{ padding: "var(--tm-page-py, 28px) var(--tm-page-px, 32px)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton style={{ width: 220, height: 26, borderRadius: 8 }} />
            <Skeleton style={{ width: 340, height: 13, borderRadius: 4 }} />
          </div>
          <Skeleton style={{ width: 130, height: 38, borderRadius: 10 }} />
        </div>
        <Skeleton style={{ width: "100%", height: 280, borderRadius: "var(--tm-radius-lg, 14px)" }} />
      </div>
    </div>
  )
}
