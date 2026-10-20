import { useEffect, useMemo, useState } from "react"

import { jobs, type ApplicationStatus } from "@/lib/api"
import { useXPStore } from "@/store/xpStore"

/**
 * One job-import model, two skins (ADR-0010). No JSX. The web dialog and the
 * phone sheet render `state` and call these methods; neither fetches.
 *
 * Review is always shown. The extractor sometimes reads a page tagline as the
 * role, and the save is the moment that mistake becomes the job.
 *
 * A link that is a listing Myro already holds (`listing_job_id`, FD1) reviews
 * read-only and saves that listing by id — its fields are the listing's, and
 * an edit would not reach it.
 */

export type JobImportState =
  | { step: "idle" }
  | { step: "extracting" }
  | { step: "review"; role: string; company: string; jd: string; location: string; listing: boolean }
  | { step: "importing"; role: string; company: string; jd: string; location: string }
  | { step: "imported"; jobId: string; tailorHref: string }
  | { step: "failed"; reason: string; canPasteInstead: boolean }

export interface JobExtract {
  company: string
  role: string
  location: string
  job_description: string
  /** A link only: the live listing Myro holds at that page. */
  listing_job_id?: string | null
}

export interface JobImportClient {
  extractUrl: (url: string) => Promise<JobExtract>
  extractFile: (file: File) => Promise<JobExtract>
  importJob: (body: {
    role_name: string
    company_name: string | null
    location: string | null
    job_description: string
    source_url: string | null
    source_platform: string
    primary_skills: string[]
    secondary_skills: string[]
    status: ApplicationStatus
    listing_job_id: string | null
  }) => Promise<{ job_id: string; coin_balance?: number | null }>
}

interface Draft {
  role: string
  company: string
  jd: string
  location: string
  sourceUrl: string | null
  listingJobId: string | null
}

const EMPTY_DRAFT: Draft = { role: "", company: "", jd: "", location: "", sourceUrl: null, listingJobId: null }

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function reviewOf(draft: Draft): JobImportState {
  return {
    step: "review",
    role: draft.role,
    company: draft.company,
    jd: draft.jd,
    location: draft.location,
    listing: draft.listingJobId !== null,
  }
}

export interface JobImportController {
  getState: () => JobImportState
  subscribe: (listener: () => void) => () => void
  submitLink: (url: string) => Promise<void>
  submitFile: (file: File) => Promise<void>
  pasteInstead: () => void
  updateReview: (patch: Partial<Pick<Draft, "role" | "company" | "jd" | "location">>) => void
  confirm: (status?: ApplicationStatus) => Promise<{ jobId: string; tailorHref: string } | null>
  retry: () => void
  reset: () => void
}

export function createJobImport(
  client: JobImportClient,
  opts?: { sourcePlatform?: string; onBalance?: (balance: number) => void },
): JobImportController {
  let state: JobImportState = { step: "idle" }
  let draft: Draft = { ...EMPTY_DRAFT }
  let ticket = 0
  const listeners = new Set<() => void>()

  function emit(next: JobImportState) {
    state = next
    listeners.forEach((listener) => listener())
  }

  function openReview() {
    emit(reviewOf(draft))
  }

  async function extract(run: () => Promise<JobExtract>, fallback: string) {
    const mine = ++ticket
    emit({ step: "extracting" })
    try {
      const parsed = await run()
      if (mine !== ticket) return
      draft = {
        role: parsed.role,
        company: parsed.company,
        jd: parsed.job_description,
        location: parsed.location,
        sourceUrl: draft.sourceUrl,
        listingJobId: parsed.listing_job_id ?? null,
      }
      openReview()
    } catch (error) {
      if (mine !== ticket) return
      emit({ step: "failed", reason: message(error, fallback), canPasteInstead: true })
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async submitLink(url) {
      const target = url.trim()
      if (!target) {
        emit({ step: "failed", reason: "Paste a job posting link first.", canPasteInstead: true })
        return
      }
      draft = { ...EMPTY_DRAFT, sourceUrl: target }
      await extract(() => client.extractUrl(target), "Couldn't read that link.")
    },
    async submitFile(file) {
      draft = { ...EMPTY_DRAFT }
      await extract(() => client.extractFile(file), "Couldn't read that file.")
    },
    pasteInstead() {
      if (state.step === "failed" && !state.canPasteInstead) return
      if (state.step !== "idle" && state.step !== "failed") return
      openReview()
    },
    updateReview(patch) {
      if (state.step !== "review" || draft.listingJobId) return
      draft = { ...draft, ...patch }
      openReview()
    },
    async confirm(status = "saved") {
      if (state.step !== "review") return null
      const role = draft.role.trim()
      const jd = draft.jd.trim()
      if (!role || !jd) return null
      const mine = ++ticket
      emit({ step: "importing", role: draft.role, company: draft.company, jd: draft.jd, location: draft.location })
      try {
        const app = await client.importJob({
          role_name: role,
          company_name: draft.company.trim() || null,
          location: draft.location.trim() || null,
          job_description: jd,
          source_url: draft.sourceUrl,
          source_platform: opts?.sourcePlatform ?? "manual_web",
          // The save extracts skills when these are empty. The review the
          // person confirms is the role and the description, not a skill list.
          primary_skills: [],
          secondary_skills: [],
          status,
          listing_job_id: draft.listingJobId,
        })
        if (mine !== ticket) return null
        if (typeof app.coin_balance === "number") opts?.onBalance?.(app.coin_balance)
        const imported = {
          jobId: app.job_id,
          tailorHref: `/cv?jobId=${encodeURIComponent(app.job_id)}`,
        }
        emit({ step: "imported", ...imported })
        return imported
      } catch (error) {
        if (mine !== ticket) return null
        emit({ step: "failed", reason: message(error, "Couldn't save that."), canPasteInstead: false })
        return null
      }
    },
    retry() {
      if (state.step !== "failed" || state.canPasteInstead) return
      openReview()
    },
    reset() {
      if (state.step === "idle") return
      ticket += 1
      draft = { ...EMPTY_DRAFT }
      emit({ step: "idle" })
    },
  }
}

/** React binding. The skins subscribe; they do not choose the next step.
 *  `sourcePlatform` names the surface — the onboarding door says "onboarding",
 *  which is how a listing it saves becomes the first role. */
export function useJobImport(token: string, sourcePlatform?: string) {
  const setBalance = useXPStore((s) => s.setBalance)
  const controller = useMemo(
    () =>
      createJobImport(
        {
          extractUrl: (url) => jobs.extractUrl(token, url),
          extractFile: (file) => jobs.extractFile(token, file),
          importJob: (body) => jobs.importJob(token, body),
        },
        { onBalance: setBalance, sourcePlatform },
      ),
    [token, setBalance, sourcePlatform],
  )
  const [state, setState] = useState<JobImportState>(controller.getState)
  useEffect(() => {
    setState(controller.getState())
    return controller.subscribe(() => setState(controller.getState()))
  }, [controller])
  return {
    state,
    submitLink: controller.submitLink,
    submitFile: controller.submitFile,
    pasteInstead: controller.pasteInstead,
    updateReview: controller.updateReview,
    confirm: controller.confirm,
    retry: controller.retry,
    reset: controller.reset,
  }
}
