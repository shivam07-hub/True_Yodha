/**
 * Which CV a write lands on.
 *
 * A role added on the desktop job paper is new material: it belongs on that
 * job's document and on the Main CV. A phone edit of a tailored CV is a write
 * to the document that is open — the Main CV stays as it was.
 */
import type { CVStructured } from "@/lib/api"

export type OpenDocumentKind = "master" | "job"

/** The tailored CV a phone is editing. `save` writes this job's document. */
export interface OpenJobCv {
  jobId: string
  company: string
  title: string
  versionId: number | null
  versionBelongsToJob: boolean
  hiddenItems: string[]
  sectionOrder: string[]
  footerMarkHidden: boolean
  save: (cv: CVStructured) => Promise<void>
}

export async function writeOpenDocument(
  kind: OpenDocumentKind,
  cv: CVStructured,
  writers: {
    saveMaster: (cv: CVStructured) => Promise<unknown>
    saveJob: (cv: CVStructured) => Promise<unknown>
  },
): Promise<void> {
  if (kind === "job") {
    await writers.saveJob(cv)
    return
  }
  await writers.saveMaster(cv)
}
