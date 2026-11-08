/**
 * A recruiter's way back to her door through sign-in.
 *
 * Two cases, one landing. She wrote a post on /recruiters and pressed Post
 * before she had an account: the post is carried and goes out once. Or she
 * posted earlier and signs in from her door to see who applied. Either way
 * sign-in lands her on /recruiters — never on the CV upload stepper, which
 * asked a recruiter for her own CV, and never on Jobs.
 *
 * Mirrors the anon job-save stash: sessionStorage survives the OAuth
 * full-page redirect, and postAuthDestination reads `hasRecruiterReturn`.
 */
import type { HostedInternshipInput } from "@/lib/api"

const POST_KEY = "myro_pending_internship_post_v1"
const RETURN_KEY = "myro_recruiter_return_v1"

export function stashPendingInternshipPost(body: HostedInternshipInput): void {
  try {
    sessionStorage.setItem(POST_KEY, JSON.stringify(body))
  } catch {
    // sessionStorage unavailable (private mode / quota). She lands back on the
    // empty form after sign-in and writes it again — no post is half-made.
  }
}

/** She is signing in from her door to come back to it. */
export function stashRecruiterReturn(): void {
  try {
    sessionStorage.setItem(RETURN_KEY, "1")
  } catch {
    // Without storage she lands on Jobs and her door is one link away.
  }
}

/** Read without clearing — postAuthDestination picks the landing from this. */
export function hasRecruiterReturn(): boolean {
  try {
    return sessionStorage.getItem(POST_KEY) !== null || sessionStorage.getItem(RETURN_KEY) !== null
  } catch {
    return false
  }
}

/** She is back on her door; the return has done its job. */
export function clearRecruiterReturn(): void {
  try {
    sessionStorage.removeItem(RETURN_KEY)
  } catch {
    // nothing to clear
  }
}

/** Read + clear, so the post goes out exactly once. */
export function takePendingInternshipPost(): HostedInternshipInput | null {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(POST_KEY)
    sessionStorage.removeItem(POST_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    return JSON.parse(raw) as HostedInternshipInput
  } catch {
    return null
  }
}
