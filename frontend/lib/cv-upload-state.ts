/**
 * cv-upload-state.ts — pure state-machine helpers for the ADR-0004 two-phase
 * upload protocol. Separated from api.ts so the polling logic can be tested
 * without spinning up Next, fetch, or the auth refresh stack.
 */

/**
 * Mirrors `CVUploadPhase` in backend/app/schemas/cv.py — keep them in step.
 *
 * `reading` and `structuring_cv` are not written by any code path today (raw
 * text is extracted before the job is accepted; the layout parse is deferred).
 * They stay because rows persisted before that change still poll, and a client
 * that cannot name a phase it receives is a client that cannot render it.
 */
export type CVUploadPhase =
  | "queued" | "reading" | "finding_skills" | "saving" | "structuring_cv"
  | "ready" | "failed"

export type CVUploadInitial =
  | {
      status: "done"
      skills_detected: number
      score: number | null
      redirect_to: string
      xp_charged: number
    }
  | {
      status: "processing"
      job_id: string
    }
  | {
      status: "failed"
      current_phase?: CVUploadPhase | null
      skills_detected?: number | null
      error_code: string | null
      error_detail: string | null
      xp_charged?: number | null
      xp_refunded?: boolean | null
      new_coin_balance?: number | null
      redirect_to?: string | null
    }

export interface CVUploadPolledStatus {
  status: "processing" | "done" | "failed"
  /** #6 deploy-style loading phase. */
  current_phase?: CVUploadPhase | null
  skills_detected: number | null
  // No score on a polled job. Scoring waits for skill confirmation, which happens
  // after the job finishes — a polled result always routes to redirect_to, where
  // the user confirms and earns it. Only the synchronous cache-hit reply carries one.
  error_code: string | null
  error_detail: string | null
  xp_charged: number
  /** Terminal polls only. A processing poll answers null rather than paying a
   *  `user_profiles` read per tick — see `get_cv_upload_status`. */
  new_coin_balance: number | null
  xp_refunded: boolean
  /** Job-creation timestamp (ISO), retained for upload lifecycle observability. */
  started_at?: string | null
  redirect_to: string | null
}

export interface CVUploadResultShape {
  skills_detected: number
  score: number | null
  xp_charged: number
  new_coin_balance: number | null
  redirect_to: string
}

export class CVUploadFailureBase extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly xpRefunded: boolean,
    public readonly newXpBalance: number | null,
    public readonly retryable: boolean = false,
    public readonly phase: "pick" | "signed-url" | "put" | "poll" | "parse" | null = null,
  ) {
    super(message)
    this.name = "CVUploadFailure"
  }
}

export interface ResolveUploadOptions {
  intervalMs?: number
  timeoutMs?: number
  maxTransientFailures?: number
  /** Injectable clock — defaults to Date.now + setTimeout. Tests override. */
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  /** #6 — fired with every processing poll so the loading UI can show the
   *  live persisted worker phase. Not called on the synchronous done path. */
  onProgress?: (status: CVUploadPolledStatus) => void
}

const DEFAULT_INTERVAL_MS = 2_000
const DEFAULT_TIMEOUT_MS = 180_000
const DEFAULT_MAX_TRANSIENT_FAILURES = 4

export function tokenizedUserMessage(message: string): string {
  return message
    .replace(/\byour xp has\b/gi, "your tokens have")
    .replace(/\bxp has\b/gi, "tokens have")
    .replace(/\bxp\b/gi, "tokens")
}

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
      new_coin_balance: null,
      redirect_to: initial.redirect_to,
    }
  }
  if (initial.status === "failed") {
    throw new CVUploadFailureBase(
      tokenizedUserMessage(initial.error_detail ?? "CV analysis failed. Please try again."),
      initial.error_code ?? "unknown",
      initial.xp_refunded ?? false,
      initial.new_coin_balance ?? null,
      false,
      "parse",
    )
  }

  const interval = opts.intervalMs ?? DEFAULT_INTERVAL_MS
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const now = opts.now ?? (() => Date.now())
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  const maxTransientFailures = opts.maxTransientFailures ?? DEFAULT_MAX_TRANSIENT_FAILURES
  const deadline = now() + timeout
  let transientFailures = 0

  while (now() < deadline) {
    await sleep(interval)
    let status: CVUploadPolledStatus
    try {
      status = await fetchStatus(initial.job_id)
      transientFailures = 0
      opts.onProgress?.(status)
    } catch {
      transientFailures += 1
      if (transientFailures > maxTransientFailures) {
        throw new CVUploadFailureBase(
          "Upload status checks were interrupted. Tap to try again.",
          "poll_network_interrupted",
          false,
          null,
          true,
          "poll",
        )
      }
      continue
    }
    if (status.status === "done") {
      return {
        skills_detected: status.skills_detected ?? 0,
        score: null,
        xp_charged: status.xp_charged,
        new_coin_balance: status.new_coin_balance,
        redirect_to: status.redirect_to ?? "/onboarding/result",
      }
    }
    if (status.status === "failed") {
      throw new CVUploadFailureBase(
        tokenizedUserMessage(status.error_detail ?? "CV analysis failed. Please try again."),
        status.error_code ?? "unknown",
        status.xp_refunded,
        status.new_coin_balance,
        false,
        "parse",
      )
    }
    // processing — loop
  }
  throw new CVUploadFailureBase(
    "CV analysis is taking unusually long. Tap to resume this upload.",
    "poll_timeout",
    false,
    null,
    true,
    "poll",
  )
}
