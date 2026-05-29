"use client"

/**
 * Loading skeleton for a single Intel result row. Mirrors the live grid of
 * <CompanyRow> + <GroupRow> + <JobRow> so the layout never shifts on data
 * arrival. Static-greyed-pulse only — never shimmer-sweep (avoids the
 * misleading "data streaming in" perception when nothing is actually loading).
 *
 * Respects prefers-reduced-motion via the .tm-intel-skel-pulse CSS rule.
 */

export function IntelRowSkeleton({ variant = "company" }: { variant?: "company" | "group" | "job" }) {
  if (variant === "job") {
    return (
      <div className="tm-intel-job-row tm-intel-skel">
        <div className="tm-intel-job-head">
          <div className="tm-intel-skel-bar tm-intel-skel-pulse" style={{ width: "60%", height: 14 }} />
          <div className="tm-intel-skel-bar tm-intel-skel-pulse" style={{ width: 72, height: 18, borderRadius: 99 }} />
        </div>
        <div className="tm-intel-job-sub" style={{ marginTop: 8 }}>
          <div className="tm-intel-skel-bar tm-intel-skel-pulse" style={{ width: "40%", height: 11 }} />
        </div>
        <div className="tm-intel-job-skills" style={{ marginTop: 10 }}>
          <span className="tm-intel-skel-chip tm-intel-skel-pulse" />
          <span className="tm-intel-skel-chip tm-intel-skel-pulse" />
          <span className="tm-intel-skel-chip tm-intel-skel-pulse" />
        </div>
      </div>
    )
  }
  return (
    <div className="tm-intel-co-row is-static tm-intel-skel" aria-hidden="true">
      <div className="tm-intel-co-logo tm-intel-skel-logo tm-intel-skel-pulse" />
      <div className="tm-intel-co-body">
        <div className="tm-intel-skel-bar tm-intel-skel-pulse" style={{ width: "55%", height: 13 }} />
        <div className="tm-intel-skel-bar tm-intel-skel-pulse" style={{ width: "35%", height: 11, marginTop: 6 }} />
      </div>
      <div className="tm-intel-co-spark">
        <div className="tm-intel-skel-spark tm-intel-skel-pulse" />
      </div>
      <div className="tm-intel-co-roles">
        <div className="tm-intel-skel-bar tm-intel-skel-pulse" style={{ width: 30, height: 18 }} />
      </div>
    </div>
  )
}

export function IntelRowSkeletonList({ count = 8, variant = "company" }: { count?: number; variant?: "company" | "group" | "job" }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <IntelRowSkeleton key={i} variant={variant} />
      ))}
    </>
  )
}
