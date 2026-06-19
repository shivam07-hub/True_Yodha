import { LoaderCircle, Wifi } from "lucide-react"

const PHASES: Record<string, string> = {
  queued: "Preparing your analysis",
  reading: "Reading your experience",
  finding_skills: "Finding evidence-backed skills",
  scoring: "Scoring against your target",
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
        You can leave this page. Myro will continue from the saved analysis when you return.
      </p>
    </section>
  )
}
