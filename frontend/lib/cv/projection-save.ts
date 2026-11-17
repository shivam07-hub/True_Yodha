/**
 * Is the projection on screen a change worth saving?
 *
 * `saved` is the serialised projection of the version the page last hydrated
 * from or wrote, and `null` until the first hydration. Before that there is
 * nothing to compare with: the empty projection on screen is the page still
 * loading, not a person's edit. Treating it as one wrote a job's CV 1.2 s
 * after its page opened, and `_stage` then called the job tailored (#62 R0).
 */
export function projectionChanged(saved: string | null, onScreen: string): boolean {
  return saved !== null && saved !== onScreen
}
