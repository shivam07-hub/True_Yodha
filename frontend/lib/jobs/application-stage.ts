import type { ApplicationResponse, JobMatch } from "@/lib/api"

/** Anything past "saved" is committed — the user has actually sent something.
 *  Lived in `lib/collections/model.ts` until the Collection Record moved stage
 *  resolution to the server; this is the raw-application predicate the surfaces
 *  that still read `ApplicationResponse[]` (the Next chip, Prep) need. */
export const isApplied = (a: ApplicationResponse) => a.status !== "saved"

/** {job_id: match} index over a match stack. */
export function matchesById(matches: JobMatch[] | undefined): Map<string, JobMatch> {
  const m = new Map<string, JobMatch>()
  for (const j of matches ?? []) m.set(j.job_id, j)
  return m
}
