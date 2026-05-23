/**
 * cv-upload-state.ts — pure state-machine helpers for the ADR-0004 two-phase
 * upload protocol. Separated from api.ts so the polling logic can be tested
 * without spinning up Next, fetch, or the auth refresh stack.
 */

export type CVUploadInitial =
  | {
      status: "done"
      skills_detected: number
      score: number
      redirect_to: string
      xp_charged: number
    }
  | {
      status: "processing"
      job_id: string
    }

export interface CVUploadPolledStatus {
  status: "processing" | "done" | "failed"
  skills_detected: number | null
  score: number | null
  error_code: string | null
  error_detail: string | null
  xp_charged: number
  xp_refunded: boolean
  new_xp_balance: number
  redirect_to: string | null
}

export interface CVUploadResultShape {
  skills_detected: number
  score: number
  xp_charged: number
  new_xp_balance: number | null
  redirect_to: string
}

export class CVUploadFailureBase extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly xpRefunded: boolean,
    public readonly newXpBalance: number | null,
  ) {
    super(message)
    this.name = "CVUploadFailure"
  }
}

export interface ResolveUploadOptions {
  intervalMs?: number
  timeoutMs?: number
  /** Injectable clock — defaults to Date.now + setTimeout. Tests override. */
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

const DEFAULT_INTERVAL_MS = 2_000
const DEFAULT_TIMEOUT_MS = 180_000

export async function resolveCVUploadResult(
  initial: CVUploadInitial,
  fetchStatus: (jobId: string) => Promise<CVUploadPolledStatus>,
  opts: ResolveUploadOptions = {},
): Promise<CVUploadResultShape> {
  if (initial.status === "done") {
    return {
      skills_detected: initial.skills_detected,
      score: initial.score,
      xp_charged: initial.xp_charged,
      new_xp_balance: null,
      redirect_to: initial.redirect_to,
    }
  }

  const interval = opts.intervalMs ?? DEFAULT_INTERVAL_MS
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const now = opts.now ?? (() => Date.now())
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  const deadline = now() + timeout

  while (now() < deadline) {
    await sleep(interval)
    const status = await fetchStatus(initial.job_id)
    if (status.status === "done") {
      return {
        skills_detected: status.skills_detected ?? 0,
        score: status.score ?? 0,
        xp_charged: status.xp_charged,
        new_xp_balance: status.new_xp_balance,
        redirect_to: status.redirect_to ?? "/onboarding/score",
      }
    }
    if (status.status === "failed") {
      throw new CVUploadFailureBase(
        status.error_detail ?? "CV analysis failed. Please try again.",
        status.error_code ?? "unknown",
        status.xp_refunded,
        status.new_xp_balance,
      )
    }
    // processing — loop
  }
  throw new Error("CV analysis is taking unusually long. Refresh and try again.")
}
