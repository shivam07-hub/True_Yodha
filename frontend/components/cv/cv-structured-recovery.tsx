import { ExternalLink, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"

interface CvStructuredRecoveryProps {
  isRetrying: boolean
  onRetry: () => void
}

export function CvStructuredRecovery({ isRetrying, onRetry }: CvStructuredRecoveryProps) {
  return (
    <section
      role="alert"
      aria-labelledby="cv-structured-recovery-title"
      className="mx-auto flex max-w-lg flex-col items-center rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface)] px-6 py-10 text-center shadow-sm"
    >
      <RefreshCw aria-hidden="true" className="size-6 text-[var(--tm-interactive)]" />
      <h2
        id="cv-structured-recovery-title"
        className="mt-4 text-balance text-xl font-semibold text-[var(--tm-text)]"
      >
        Your CV review isn&apos;t ready yet
      </h2>
      <p className="mt-2 max-w-md text-pretty text-sm text-[var(--tm-text-muted)]">
        Myro couldn&apos;t prepare the document view. Your uploaded CV is saved, so try loading it again.
      </p>
      <Button className="mt-6" loading={isRetrying} onClick={onRetry}>
        <RefreshCw aria-hidden="true" className="size-4" />
        Try loading the CV again
      </Button>
      <a
        href="/market"
        target="_blank"
        rel="opener"
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--tm-interactive)] underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tm-int-border)]"
      >
        Browse jobs while Myro works
        <ExternalLink aria-hidden="true" className="size-3.5" />
      </a>
    </section>
  )
}
