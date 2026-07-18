import { bandLabel } from "@/lib/score-methodology"

interface Props {
  band?: string | null
  /** 100 − rank, floored at 1. Null/undefined ⇒ not yet ranked ⇒ render nothing. */
  topPercent?: number | null
  className?: string
}

/**
 * The honest, band-relative confidence line beside the Myro Score:
 * "top X% for entry-level". Always labelled for the candidate's stage — a
 * junior is compared to juniors, never hidden behind an absolute rank. Renders
 * nothing until the band has been ranked (thin/new populations show no number).
 */
export function BandPercentileLine({ band, topPercent, className }: Props) {
  if (topPercent == null) return null
  return (
    <p className={className} style={{ margin: 0, fontSize: 13, color: "var(--tm-text-muted)" }}>
      <strong style={{ color: "var(--tm-accent-text)" }}>top {topPercent}%</strong>{" "}
      for {bandLabel(band)}
    </p>
  )
}
