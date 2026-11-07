/**
 * Anon internship-post stash — carries a recruiter's written post through
 * sign-in. She writes the whole post on /recruiters before she has an account;
 * pressing Post is the intent. Without this, sign-in dropped the post and a
 * brand-new account landed on the CV upload stepper — a recruiter asked for
 * her own CV.
 *
 * Mirrors the anon job-save stash: sessionStorage survives the OAuth full-page
 * redirect, postAuthDestination reads it to land on /recruiters, and the form
 * takes it once and posts it.
 */
import type { HostedInternshipInput } from "@/lib/api"

const KEY = "myro_pending_internship_post_v1"

export function stashPendingInternshipPost(body: HostedInternshipInput): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(body))
  } catch {
    // sessionStorage unavailable (private mode / quota). She lands back on the
    // empty form after sign-in and writes it again — no post is half-made.
  }
}

/** Read without clearing — postAuthDestination picks the landing from this. */
export function hasPendingInternshipPostClaim(): boolean {
  try {
    return sessionStorage.getItem(KEY) !== null
  } catch {
    return false
  }
}

/** Read + clear, so the post goes out exactly once. */
export function takePendingInternshipPost(): HostedInternshipInput | null {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
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
