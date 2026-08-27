import { bandLabel } from "@/lib/score-methodology"

interface Props {
  band?: string | null
  /** Presentation rank from the API: `100 − percentile`, floored at 1. */
  topPercent?: number | null
  className?: string
}

/**
 * The honest, band-relative standing line beside the Myro Score.
 *
 * Reads as "ahead of X% of seniors", NOT "top X%". The API sends
 * `top_percent = 100 − rank`, so a rank of 33 arrives as 67 — and "top 67%"
 * reads like praise while encoding the opposite (bottom third of the band).
 * A comparison number that feels like a pat on the back when it is a warning
 * is the worst failure mode for a trust surface, so we state the direction
 * the user actually cares about: how many peers they are ahead of.
 *
 * Renders nothing when the band is unranked (the API sends 100 for a thin or
 * unranked population) or when the user is ahead of nobody — at the bottom we
 * cannot distinguish "genuinely last" from "nothing to rank against", and an
 * unearned claim in either direction is worse than silence.
 */
export function BandPercentileLine({ band, topPercent, className }: Props) {
  if (topPercent == null || topPercent >= 100) return null
  const aheadOf = Math.round(100 - topPercent)
  if (aheadOf <= 0) return null
  const label = bandLabel(band)
  if (!label) return null
  const styled = !className
  return (
    <p className={className} style={styled ? { margin: 0, fontSize: 13, color: "var(--tm-text-muted)" } : undefined}>
      ahead of <strong style={styled ? { color: "var(--tm-accent-text)" } : undefined}>{aheadOf}%</strong>{" "}
      of {label} candidates
    </p>
  )
}
