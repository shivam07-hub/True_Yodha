import type { OnboardingTarget } from "@/lib/api"

/**
 * The first shortlist IS a Career-Ops run — the same brain the paid "Myro
 * Search" pre-flight runs, on the house. Nobody was told.
 *
 * So the user's first meeting with that surface was a modal headed MYRO OPS ·
 * PRE-FLIGHT, six numbered inputs, and `Run · 100`. Everything about it was
 * new at the moment it asked for money. This renders the run they just got in
 * exactly that language — same eyebrow, same numbering, same labels — so the
 * vocabulary is already theirs by the time there is a price on it.
 *
 * Reported, never invented. Rows show what the run actually used; the inputs it
 * did not have are listed as unset, not filled with guesses. Read-only on
 * purpose: this screen's one job is choosing a role, and three free-text boxes
 * at the last gate before the shortlist buy profile data with conversion.
 */
const SHARPENER_LABELS: Record<string, { n: number; label: string; hint: string }> = {
  deal_breakers: { n: 3, label: "Deal-breakers", hint: "e.g. no relocation" },
  career_goal: { n: 4, label: "Career goal", hint: "where you want to be in two years" },
  superpower: { n: 5, label: "Superpower", hint: "what you're unusually good at" },
}

function Row({ n, label, children, muted }: { n: number; label: string; children: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex gap-3 border-b border-[var(--tm-border-soft)] py-2.5 last:border-b-0">
      {/* 92px is the modal's own column, kept for the phone. This surface has
          room the dialog doesn't, so the labels stop wrapping mid-word above it. */}
      <div className="flex w-[92px] shrink-0 items-baseline gap-1.5 pt-0.5 sm:w-[132px]">
        {/* Muted, not faint. The modal prints these ordinals faint, where they are
            decoration next to an editable field. Here the NUMBER is the payload —
            it is what carries over to the pre-flight manifest — and faint measures
            2.76:1 on the light surface. Mono against the label's uppercase
            semibold keeps the two apart without spending legibility on it. */}
        <span className="font-mono text-[10px] tabular-nums text-[var(--tm-text-muted)]">{String(n).padStart(2, "0")}</span>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--tm-text-muted)]">{label}</span>
      </div>
      <div className={`min-w-0 flex-1 text-sm ${muted ? "text-[var(--tm-text-muted)]" : "text-[var(--tm-text)]"}`}>{children}</div>
    </div>
  )
}

export function OpsReceipt({ target, sharpeners, cvReady }: {
  target: OnboardingTarget
  sharpeners: string[]
  cvReady: boolean
}) {
  const used = [
    { n: 1, label: "Target roles", value: target.role_title },
    { n: 2, label: "Location", value: target.location || "Anywhere" },
  ].filter((row) => row.value)
  const unset = sharpeners.map((key) => SHARPENER_LABELS[key]).filter(Boolean)

  return (
    <section className="mt-8 rounded-lg border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-4 sm:p-5" aria-labelledby="ops-receipt-title">
      {/* --tm-accent-text, not --tm-interactive: the latter is the FILL colour and
          measures 3.29:1 as ink on the light paper. Same orange to the eye, 5.28:1. */}
      <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--tm-accent-text)]">Myro Ops · flight complete</p>
      <h2 id="ops-receipt-title" className="mt-1.5 text-base font-semibold text-[var(--tm-text)]">
        Myro searched the live market with
      </h2>

      <div className="mt-3">
        {used.map((row) => <Row key={row.n} n={row.n} label={row.label}>{row.value}</Row>)}
        <Row n={6} label="CV" muted={!cvReady}>{cvReady ? "CV baseline · ready" : "CV baseline · processing"}</Row>
      </div>

      {unset.length > 0 && (
        <>
          <p className="mt-4 text-sm text-[var(--tm-text-muted)]">Add these later and the same search gets sharper:</p>
          <div className="mt-1.5">
            {unset.map((row) => <Row key={row.n} n={row.n} label={row.label} muted>{row.hint}</Row>)}
          </div>
        </>
      )}
    </section>
  )
}
