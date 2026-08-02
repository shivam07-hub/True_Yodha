import { ExternalLink, LoaderCircle, Wifi } from "lucide-react"

const PHASES: Record<string, string> = {
  queued: "Preparing your analysis",
  reading: "Reading your CV",
  finding_skills: "Extracting your skills",
  structuring_cv: "Preparing your CV review",
  scoring: "Calculating your Myro Score",
  opening_review: "Opening your CV review",
  reconnecting: "Reconnecting to your analysis",
}

export function AnalysisProgress({ phase }: { phase: string }) {
  const reconnecting = phase === "reconnecting"
  const Icon = reconnecting ? Wifi : LoaderCircle
  return (
    <section className="flex min-h-[55dvh] w-full max-w-lg flex-col items-center justify-center text-center" role="status">
      <span className="flex size-12 items-center justify-center rounded-full border border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-interactive)]">
        <Icon className={`size-5 ${reconnecting ? "" : "animate-spin"}`} aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-balance text-2xl font-semibold tracking-normal text-[var(--tm-text)]">
        {PHASES[phase] ?? "Building your result"}
      </h1>
      <p className="mt-2 max-w-sm text-pretty text-sm leading-6 text-[var(--tm-text-muted)]">
        Myro will keep working if you browse jobs.
      </p>
      <a
        href="/market"
        target="_blank"
        // The destination is this same Myro origin. `opener` deliberately keeps
        // the browser's initial sessionStorage clone, so an in-progress CV
        // upload can be browsed in a new tab without making the user sign in
        // again. Do not use this relationship for an external link.
        rel="opener"
        className="tm-control-focus mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface)] px-5 text-sm font-semibold text-[var(--tm-interactive-rest)] transition-colors hover:bg-[var(--tm-surface-hover)]"
      >
        Browse jobs while Myro works
        <ExternalLink className="size-4" aria-hidden="true" />
      </a>
    </section>
  )
}
