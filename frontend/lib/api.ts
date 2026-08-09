/**
 * Typed API client for the Mirror FastAPI backend.
 * All server state should be fetched through this file.
 * Never call fetch() directly in components — use TanStack Query + these functions.
 */

import { getAnonSessionId } from "@/lib/anon-cv-stash"
import {
  acquireRefreshLock,
  clearSessionTokens,
  getRefreshToken,
  releaseRefreshLock,
  setSessionTokens,
  waitForAccessTokenChange,
} from "./session"
import {
  type CVUploadInitial,
  type CVUploadPolledStatus,
  type CVUploadResultShape,
  CVUploadFailureBase,
  resolveCVUploadResult,
} from "./cv-upload-state"
import { preflightCVUploadFile } from "./cv-file-detect"
import { queryClient } from "./query-client"
import { ApiError, classifyError, readErrorCode, readTraceId } from "./api-error"
import { getTurnstileToken } from "./turnstile"
import type { AcquisitionAttribution } from "./attribution"
import type {
  BetaAssignmentReceipt,
  BetaAssignmentStatus,
  BetaFeedbackDraft,
} from "./beta-feedback"
import {
  clearCVUploadPersistence,
  createCVUploadIdempotencyKey,
  persistCVUploadIdempotencyKey,
  persistCVUploadJob,
  readCVUploadIdempotencyKey,
  readCVUploadJob,
} from "./cv-upload-storage"
import {
  clearPendingCVUpload,
  readPendingCVUpload,
  stashPendingCVUpload,
} from "./cv-upload-queue"
import {
  jwtSub,
  resumableUploadSupported,
  uploadCVToStorage,
} from "./cv-resumable-upload"

/**
 * Hard ceiling on a single request. Without this a server that accepts the
 * connection but never responds leaves the promise pending forever — which is
 * exactly what wedges the dashboard on its skeleton. On fire → AbortError →
 * classifyError → ApiError{kind:"timeout"} → the failure UI can react.
 */
const REQUEST_TIMEOUT_MS = 15_000
/**
 * LLM-backed endpoints (whole-CV restructure, bullet rewrite, polish) run a
 * provider chain with fallbacks and routinely take 20–30s. The 15s default
 * aborts them mid-flight → the user sees a spurious "unavailable" while the
 * server keeps working and 200s into the void. These opt into a longer ceiling.
 */
const LLM_REQUEST_TIMEOUT_MS = 60_000

/** request() init plus our own per-call timeout override. */
type ApiRequestInit = RequestInit & { timeoutMs?: number }

/** Combine the caller's AbortSignal (if any) with a timeout into one signal. */
function withTimeout(
  signal: AbortSignal | null | undefined,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): {
  signal: AbortSignal
  done: () => void
} {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException("Timeout", "AbortError")), timeoutMs)
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true })
  }
  return { signal: controller.signal, done: () => clearTimeout(timer) }
}

const BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  ""

function extractError(body: unknown, status: number): string {
  if (typeof body !== "object" || body === null) return `HTTP ${status}`
  const detail = (body as Record<string, unknown>).detail
  if (typeof detail === "string") return detail
  if (typeof detail === "object" && detail !== null) {
    const maybeMessage = (detail as Record<string, unknown>).message
    if (typeof maybeMessage === "string") return maybeMessage
    return `HTTP ${status}`
  }
  if (Array.isArray(detail)) return detail.map((e: { msg?: string }) => e.msg ?? JSON.stringify(e)).join("; ")
  return `HTTP ${status}`
}

function isSessionUnauthorized(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return true
  const detail = (body as Record<string, unknown>).detail
  if (typeof detail !== "string") return false
  return [
    "Authentication required",
    "Invalid token",
    "Invalid or expired token",
    "Not authenticated",
    "Session expired",
  ].includes(detail)
}

// Deduplicates concurrent refresh calls within a tab — Supabase rotates refresh
// tokens on each use, so parallel 401s must share one refresh or the second
// invalidates the first.
let _refreshInFlight: Promise<string | null> | null = null

const _LOCK_TTL = 6000 // ms — must exceed worst-case refresh round-trip

async function tryRefreshToken(): Promise<string | null> {
  if (typeof window === "undefined") return null
  if (_refreshInFlight) return _refreshInFlight
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null

  // Another tab already holds the lock — wait for it to write the new token.
  if (!acquireRefreshLock(_LOCK_TTL)) return waitForAccessTokenChange(_LOCK_TTL)

  _refreshInFlight = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (!res.ok) return null
      const data = await res.json() as { access_token: string; refresh_token: string | null }
      setSessionTokens({ accessToken: data.access_token, refreshToken: data.refresh_token })
      void queryClient.invalidateQueries()
      return data.access_token
    } catch {
      return null
    } finally {
      releaseRefreshLock()
      _refreshInFlight = null
    }
  })()
  return _refreshInFlight
}

function forceLogout(): never {
  queryClient.clear()
  clearSessionTokens()
  if (typeof window !== "undefined") window.location.href = "/login"
  throw new Error("Session expired. Please sign in again.")
}

async function request<T>(path: string, init?: ApiRequestInit, _isRetry = false): Promise<T> {
  const { headers: extraHeaders, signal: callerSignal, timeoutMs, ...rest } = init ?? {}
  const { signal, done } = withTimeout(callerSignal, timeoutMs)
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...extraHeaders },
      signal,
      ...rest,
    })
  } catch (e) {
    // fetch rejected (timeout / offline / network) — the case the old code
    // dropped silently. Normalize so the failure UI can classify it.
    throw classifyError(e)
  } finally {
    done()
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    if (res.status === 401 && typeof window !== "undefined") {
      if (!_isRetry) {
        const newToken = await tryRefreshToken()
        if (newToken) {
          // Patch Authorization header with new token and retry once
          const newHeaders = { ...(extraHeaders as Record<string, string> ?? {}), Authorization: `Bearer ${newToken}` }
          return request<T>(path, { ...rest, headers: newHeaders }, true)
        }
      }
      if (isSessionUnauthorized(body)) forceLogout()
    }
    throw new ApiError(extractError(body, res.status), {
      status: res.status,
      kind: "http",
      traceId: readTraceId(res, body),
      code: readErrorCode(body),
    })
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/**
 * Conditional GET for the Feed State ETag flow. The generic request<T>() above
 * assumes a JSON body on every success, so it cannot represent a 304 (no body).
 * This helper preserves the ETag round-trip: send If-None-Match, surface 304 as
 * a distinct outcome, and read the ETag header back on a 200.
 */
async function requestConditional(
  path: string,
  token: string,
  etag: string | null,
): Promise<{ status: number; etag: string | null; json: unknown }> {
  const { signal, done } = withTimeout(null)
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(etag ? { "If-None-Match": etag } : {}),
      },
      signal,
    })
  } catch (e) {
    throw classifyError(e)
  } finally {
    done()
  }
  if (res.status === 304) {
    return { status: 304, etag: res.headers.get("ETag") ?? etag, json: null }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(extractError(body, res.status), {
      status: res.status,
      kind: "http",
      traceId: readTraceId(res, body),
      code: readErrorCode(body),
    })
  }
  return { status: res.status, etag: res.headers.get("ETag"), json: await res.json() }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  access_token: string | null
  refresh_token: string | null
  token_type: string
  requires_email_confirmation: boolean
  message: string | null
}

export interface PostSigninResponse {
  provider: string | null
  referral_attributed: boolean
  attribution_recorded: boolean
  linkedin_xp_granted: boolean
  linkedin_url_set: boolean
  partner_linked: boolean
}

export interface PostSigninRequestBody {
  provider?: string | null
  myro_ref?: string | null
  attribution?: AcquisitionAttribution | null
  is_new_signup?: boolean
  linkedin_vanity?: string | null
  linkedin_headline?: string | null
  linkedin_verified?: boolean | null
  /**
   * Partner SSO completion. Present when the sign-in landed from a partner
   * verification link. The backend re-checks that this account's email matches
   * the seat the partner named, so forwarding them proves nothing on its own —
   * signing in is the proof.
   */
  link_partner?: string | null
  partner_external_id?: string | null
}

export interface MagicLinkResponse {
  sent: boolean
  message: string
  retry_after_seconds?: number | null
}

/**
 * The partner consent screen. A partner's user whose email already has a Myro
 * account is sent here instead of being signed straight in — the account owner
 * approves the connection themselves. The token in the url names the seat; it
 * grants nothing on its own.
 */
export interface PartnerConnectContext {
  partner_name: string
  partner_slug: string
  external_id: string
  email_masked: string
}

export interface PartnerConnectApproveResponse {
  linked: boolean
  message: string
}

export interface PartnerConnectEmailResponse {
  sent: boolean
  message: string
}

export const partnerConnect = {
  context: (token: string) =>
    request<PartnerConnectContext>(`/partner-connect/context?t=${encodeURIComponent(token)}`),
  approve: (accessToken: string, token: string) =>
    request<PartnerConnectApproveResponse>("/partner-connect/approve", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ token }),
    }),
  emailLink: (token: string) =>
    request<PartnerConnectEmailResponse>("/partner-connect/email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
}

export interface IntegrationRevokeResponse {
  provider: string
  revoked: boolean
  message: string
}

export interface ExtensionSessionResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_at: number | null
}

export const auth = {
  signup: (
    email: string,
    password: string,
    fullName?: string | null,
    myroRef?: string | null,
    attribution?: AcquisitionAttribution | null,
  ) =>
    request<AuthResponse>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        full_name: fullName,
        myro_ref: myroRef ?? null,
        attribution: attribution ?? null,
      }),
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  /** ADR-0006 — runs after Supabase returns the session. */
  postSignin: (token: string, body: PostSigninRequestBody) =>
    request<PostSigninResponse>("/auth/post-signin", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      // keepalive: the auth callback fires this AFTER it has already redirected
      // to /home, so the page is navigating away. Without keepalive the browser
      // cancels the in-flight request on navigation and referral attribution
      // (SH7) + LinkedIn XP grant are silently lost. Body is tiny — well under
      // the 64KB keepalive ceiling.
      keepalive: true,
    }),
  magicLinkRequest: (email: string, redirectTo?: string | null) =>
    request<MagicLinkResponse>("/auth/magic-link-request", {
      method: "POST",
      body: JSON.stringify({ email, redirect_to: redirectTo ?? null }),
    }),
  revokeIntegration: (token: string, provider: "google" | "linkedin_oidc") =>
    request<IntegrationRevokeResponse>(`/auth/integrations/${provider}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** Mint a fresh, independent Supabase session for the browser extension. */
  extensionSession: (token: string) =>
    request<ExtensionSessionResponse>("/auth/extension-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
}

// ── User ──────────────────────────────────────────────────────────────────────

export interface UserProfile {
  email: string
  full_name: string | null
  linkedin_url: string | null
  target_roles: string[]
  target_role_title?: string | null
  target_role_titles?: string[]
  target_seniority?: "intern" | "entry" | "mid" | "senior" | "lead" | "executive" | "any" | null
  target_career_band?: CareerBand | null
  explored_career_bands?: CareerBand[]
  target_location: string | null
  target_locations: string[]
  deal_breakers: string[]
  career_goal: string | null
  superpower: string | null
  cv_url: string | null
  onboarding_complete: boolean
  ninja_name: string | null
  has_cv: boolean
  cv_readiness?: "ready" | "missing" | "processing" | "failed"
  cv_upload_job_id?: string | null
  cv_upload_error_code?: string | null
  myrology_unlocked?: boolean
  myrology_interested?: boolean
  accent_pref?: "signal" | "forge"
}

export interface ProfileUpdateResponse extends UserProfile {
  coins_earned: number
  new_coin_balance: number | null
}

export interface ProfileUpdate {
  full_name?: string | null
  linkedin_url?: string | null
  target_roles?: string[] | null
  target_role_title?: string | null
  /** Human titles — the canonical role write. Backend derives the
   *  `target_roles` cluster union; never send raw clusters alongside. */
  target_role_titles?: string[] | null
  target_seniority?: "intern" | "entry" | "mid" | "senior" | "lead" | "executive" | "any" | null
  explored_career_bands?: CareerBand[] | null
  target_location?: string | null
  target_locations?: string[] | null
  deal_breakers?: string[] | null
  career_goal?: string | null
  superpower?: string | null
  myrology_interested?: boolean
  accent_pref?: "signal" | "forge"
}

export interface UserSkillItem {
  key: string
  display_name: string
  level: number
  proficiency_title: string
  description?: string | null   // Lightcast definition (skills.description); null until enriched
  evidence_text: string | null
  forge_sessions_count: number
  forged_level_up_available: boolean
}

export interface UserSkillsByDomain {
  by_domain: Record<string, UserSkillItem[]>    // L1 domain — for radar drill-down
  by_cluster: Record<string, UserSkillItem[]>   // L2 cluster — for CV page
}

export interface FollowedCompany {
  company_name: string
  created_at: string
}

export interface FollowedCompaniesResponse {
  companies: FollowedCompany[]
  total: number
}

export interface PracticeSave {
  skill_key: string
  display_name: string
  source: string
  saved_at: string
}

export interface PracticeSavesResponse {
  skills: PracticeSave[]
  total: number
}

/** Per-skill learning intent — count = how many of the user's jobs it was
 *  upvoted from. Feeds Forge practice ordering. */
export interface SkillUpvote {
  skill_key: string
  display_name: string
  count: number
  job_ids: string[]
}

export interface SkillUpvotesResponse {
  skills: SkillUpvote[]
  total: number
}

export interface SkillUpvoteToggleResponse {
  skill_key: string
  upvoted: boolean
  count: number
}

/** One live opening on a company's public jobs page. */
export interface CompanyJobCard {
  job_id: string
  title: string
  location: string | null
  location_city: string | null
  location_country: string | null
  location_mode: string | null
  primary_skills: string[]
}

export interface CompanyJobsResponse {
  company_name: string
  total: number
  jobs: CompanyJobCard[]
  page: number
  page_size: number
  has_next: boolean
}

export const users = {
  me: (token: string) =>
    request<UserProfile>("/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  deleteAccount: (token: string) =>
    request<{ deleted: boolean }>("/users/me", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
  mySkills: (token: string) =>
    request<UserSkillsByDomain>("/users/me/skills", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  // Drop a wrongly-extracted skill, or restore one. Recomputes the score, so the
  // response carries the new number rather than promising a later refresh.
  correctSkill: (token: string, skillKey: string, included: boolean) =>
    request<{ skill_key: string; included: boolean; total_score: number; skills_assessed: number }>(
      "/users/me/skills/correction",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ skill_key: skillKey, included }),
      },
    ),
  updateProfile: (token: string, data: ProfileUpdate) =>
    request<ProfileUpdateResponse>("/users/me/profile", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    }),
  followedCompanies: (token: string) =>
    request<FollowedCompaniesResponse>("/users/me/following/companies", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  followCompany: (token: string, companyName: string) =>
    request<{ company_name: string }>("/users/me/following/companies", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ company_name: companyName }),
    }),
  unfollowCompany: (token: string, companyName: string) =>
    request<void>(`/users/me/following/companies/${encodeURIComponent(companyName)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
  practiceSaves: (token: string) =>
    request<PracticeSavesResponse>("/users/me/practice-saves", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  savePracticeSkill: (token: string, skill: { skill_key: string; display_name: string; source?: string }) =>
    request<{ skill_key: string }>("/users/me/practice-saves", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ source: "gap_session", ...skill }),
    }),
  unsavePracticeSkill: (token: string, skillKey: string) =>
    request<void>(`/users/me/practice-saves/${encodeURIComponent(skillKey)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
  skillUpvotes: (token: string) =>
    request<SkillUpvotesResponse>("/users/me/skill-upvotes", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  toggleSkillUpvote: (token: string, body: { skill_key: string; display_name?: string; job_id: string }) =>
    request<SkillUpvoteToggleResponse>("/users/me/skill-upvotes/toggle", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  updateNinjaName: (token: string, ninjaName: string) =>
    request<{ ninja_name: string }>("/profile/ninja-name", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ninja_name: ninjaName }),
    }),
  suggestNinjaName: (token: string) =>
    request<{ ninja_name: string }>("/profile/ninja-name/suggest", {
      headers: { Authorization: `Bearer ${token}` },
    }),
}

// ── Notifications (Backlog #36 Slice 2) ─────────────────────────────────────

/** One inbox row. `read_at` null = unread. For 'fresh_matches', `job_id` is the
 *  top match carried in the ping and `match_count` how many landed. */
export interface NotificationItem {
  id: number
  kind: string
  title: string
  body: string | null
  job_id: string | null
  source_id: string | null
  action_url: string | null
  state: "processing" | "ready" | "failed" | null
  match_count: number
  read_at: string | null
  created_at: string
}

export interface NotificationsResponse {
  items: NotificationItem[]
  unread_count: number
}

export const notifications = {
  /** Cheap badge poll — the bell reads this often; the inbox loads only on open. */
  unreadCount: (token: string) =>
    request<{ count: number }>("/notifications/unread-count", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  list: (token: string) =>
    request<NotificationsResponse>("/notifications", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** Mark specific notifications read, or all unread when `ids` is omitted. */
  markRead: (token: string, ids?: number[]) =>
    request<void>("/notifications/read", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(ids ? { ids } : {}),
    }),
}

// ── Trustworthy onboarding ──────────────────────────────────────────────────

/** Where the user is, DERIVED server-side from the journey's own facts — never a
 *  stored column. `experience` = nothing started · `result` = work in flight or
 *  done · `completed` = finished, belongs in the product. */
export type JourneyPosition = "experience" | "result" | "completed"
export type TargetSeniority = "intern" | "entry" | "mid" | "senior" | "lead" | "executive" | "any"

export interface OnboardingState {
  user_id: string
  position: JourneyPosition
  entry_mode?: "uploaded_cv" | "description" | null
  upload_job_id?: string | null
  accepted_file_metadata?: { name: string; mime: string; size_bytes: number }
  generator_step: number
  generator_answers: Record<string, Record<string, unknown>>
  generated_draft?: string | null
  checklist_dismissed_at?: string | null
  score_gap_reviewed_at?: string | null
  credible_job_saved_at?: string | null
  tailored_cv_created_at?: string | null
  activation_kind?: "tailor_credible_job" | "review_score_gap" | "save_credible_job" | null
}

export interface OnboardingTarget {
  // Single role (back-compat) OR role_titles for multi-role chips (up to 5).
  // Provide one of the two; role_titles wins when present.
  role_title?: string
  role_titles?: string[]
  /** Canonical corpus family chosen with the rendered title. */
  role_family?: string
  role_families?: string[]
  // Optional for point-of-use "edit role" (issue #145): omit to keep the user's
  // existing seniority/location; the backend preserves them via save_target.
  seniority?: TargetSeniority
  location?: string
  // Plural form. `[]` is a real answer ("Anywhere"); omitting the field
  // means "leave my saved locations alone".
  locations?: string[]
}

export interface RoleReadiness {
  role: string
  readiness: number | null
}

export interface RoleFamily {
  family: string
  label: string
  open_count: number
  matched_skill_count: number
}

export interface RoleFamilyLocation {
  location: string
  open_count: number
  is_remote: boolean
}

export interface FirstSuccessChecklist {
  dismissed: boolean
  complete: boolean
  items: Array<{ id: string; label: string; href: string; done: boolean }>
}

export interface FirstRoleReceipt {
  status: "saved"
  job_id: string
  tailor_href: string
}

export interface OnboardingProofSkill {
  taxonomy_key: string
  name: string
  level?: number
  /** Present on candidates awaiting confirmation — same ladder as UserSkillItem. */
  proficiency_title?: string
  evidence: string
}

/**
 * How far the user has actually GOT, which is not the same as what they are
 * looking at. The journey used to derive its step from its facts — skills
 * confirmed, target set — so the only way back was to erase a decision. This is
 * the ceiling a view cursor may move under; 0 means nothing is behind them yet.
 */
export type OnboardingReach = { furthest_step?: 0 | 1 | 2 | 3 }

export type OnboardingResult = OnboardingReach & (
  // journey_step is authored by the backend: `full_result_processing` covers BOTH
  // the first CV read (step 1) and the post-target score wait (step 3), so the
  // kind alone cannot place the progress rail.
  | { kind: "full_result_processing"; target: OnboardingTarget; phase: string; journey_step?: 1 | 2 | 3 }
  | { kind: "first_role_saved"; job_id: string; title: string; company: string; tailor_href: string }
  | { kind: "terminal_failure"; target: OnboardingTarget; error_code?: string; message?: string; xp_refunded: boolean }
  | {
      kind: "awaiting_skill_confirmation"
      baseline_version_id: number
      skills: OnboardingProofSkill[]
      journey_step?: 1 | 2 | 3
    }
  | {
      // A target must exist before Myro renders a score cohort.
      kind: "awaiting_target"
      baseline_version_id: number
      families: RoleFamily[]
      seniority: { value: TargetSeniority | null; years?: number; title?: string; source: "experience_years" | "title" | "unknown"; needs_choice: boolean }
      /** What they already chose, when arriving here from further along. Empty
       *  on the first visit — one shape, seeded the same way either way. */
      selected: { families: RoleFamily[]; seniority: TargetSeniority | null; locations: string[] }
      journey_step?: 1 | 2 | 3
    }
  | {
      kind: "full_result_ready"
      baseline_version_id: number
      target_context_hash: string
      target: OnboardingTarget
      skills: OnboardingProofSkill[]
      score: { total_score: number; domain_scores: Record<string, number>; domain_skill_counts?: Record<string, number>; gap_skills: GapSkill[]; skills_assessed: number; band?: string; band_percentile?: number | null; top_percent?: number | null }
      score_factors: Array<{ kind: "gap" | "strength"; label: string; detail: string }>
      /** Scoped to THIS direction, server-authored. Never the durable match
       *  stack — that answers "every job Myro matched you to", which after a
       *  direction change is not the shortlist the save will accept. */
      shortlist: JobMatch[]
      /** `provisional` = the shortlist is triaged and choosable, but the deep
       *  eval is still running, so its scores will sharpen in place. */
      shortlist_status: "ready" | "provisional" | "computing" | "stalled" | "empty"
      /** `sharpeners` = the optional Career-Ops inputs this user has not set.
       *  Reported, never gap-filled — a receipt must not present a suggestion
       *  as something the run used. */
      career_ops: { sharpeners: string[] }
      credible_match: (JobMatch & { jobs?: { job_title?: string; company_name?: string } }) | null
      primary_action: { kind: string; label: string; href: string }
      secondary_action: { kind: string; label: string; href: string }
    }
)

export const onboarding = {
  state: (token: string) => request<OnboardingState>("/onboarding/state", {
    headers: { Authorization: `Bearer ${token}` },
  }),
  saveExperience: (token: string, body: {
    entry_mode: "uploaded_cv"
    upload_job_id: string | null
    file_metadata: { name: string; mime: string; size_bytes: number }
  }) => request<void>("/onboarding/experience", {
    method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  }),
  saveTarget: (token: string, body: OnboardingTarget) => request<void>("/onboarding/target", {
    method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  }),
  resetTarget: (token: string) => request<void>("/onboarding/target", {
    method: "DELETE", headers: { Authorization: `Bearer ${token}` },
  }),
  roleReadiness: (token: string) => request<RoleReadiness[]>("/onboarding/role-readiness", {
    headers: { Authorization: `Bearer ${token}` },
  }),
  roleFamilies: (token: string, query?: string) => request<RoleFamily[]>(`/roles/families${query ? `?query=${encodeURIComponent(query)}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  }),
  // family goes in the QUERY, never a path segment: real family names contain
  // slashes ("… (AI/ML)") and uvicorn unquotes %2F before routing, which split
  // the path and 404'd. See backend app/routers/roles.py.
  roleFamilyLocations: (token: string, family: string, query?: string) => request<RoleFamilyLocation[]>(`/roles/family-locations?family=${encodeURIComponent(family)}${query ? `&query=${encodeURIComponent(query)}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  }),
  /** `step` LOOKS BACK at completed ground only; the server ignores a value at
   *  or beyond the user's furthest, so it can never skip work. */
  result: (token: string, step?: number) => request<OnboardingResult>(
    step ? `/onboarding/result?step=${step}` : "/onboarding/result",
    { headers: { Authorization: `Bearer ${token}` } },
  ),
  saveAnswer: (token: string, step: number, answer: Record<string, unknown>) =>
    request<void>(`/onboarding/baseline/answers/${step}`, {
      method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ answer }),
    }),
  generateBaseline: (token: string) => request<{ draft: string; source_ids: string[] }>("/onboarding/baseline/generate", {
    method: "POST", headers: { Authorization: `Bearer ${token}` },
  }),
  saveDraft: (token: string, draft: string) => request<void>("/onboarding/baseline/draft", {
    method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ draft }),
  }),
  approveBaseline: (token: string, draft: string, idempotencyKey: string) => request<CVUploadResponse>("/onboarding/baseline/approve", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ draft }),
  }),
  saveSkillOverrides: (token: string, baselineId: number, overrides: Array<{
    skill_id: number; action: "include" | "exclude"; evidence_text: string; source_location?: Record<string, unknown>
  }>) => request<{ status: "done"; total_score: number }>(`/onboarding/baseline/${baselineId}/skill-overrides`, {
    method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ overrides }),
  }),
  // Identify a skill by taxonomy_key (what every skill payload already carries)
  // or by skill_id. The key form means no caller has to pull the skill catalog.
  confirmSkills: (token: string, baselineId: number, overrides: Array<{
    skill_id?: number; taxonomy_key?: string
    action: "include" | "exclude"; evidence_text?: string; source_location?: Record<string, unknown>
  }>) => request<
    // `result` is the next step, already assembled — produced by the same
    // `get_result` the screen reads, so there is one definition of what comes
    // next. Seed the cache with it instead of re-asking: measured on prod
    // 2026-08-04, confirming took 8.4s and the refetch that discarded this
    // answer took another 8.2s, for one button press.
    { status: "confirmed"; next: "target" | "shortlist_processing"; result: OnboardingResult }
  >(`/onboarding/baseline/${baselineId}/confirm-skills`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ overrides }),
  }),
  commitFirstRole: (token: string, jobId: string) => request<FirstRoleReceipt>("/onboarding/first-role", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ job_id: jobId }),
  }),
  activate: (token: string, activationKind: "tailor_credible_job" | "review_score_gap" | "save_credible_job") =>
    request<void>("/onboarding/activate", {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ activation_kind: activationKind }),
    }),
  markMilestone: (token: string, milestone: "score_gap_reviewed" | "credible_job_saved" | "tailored_cv_created") =>
    request<void>(`/onboarding/milestones/${milestone}`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    }),
  dismissChecklist: (token: string) => request<void>("/onboarding/checklist/dismiss", {
    method: "POST", headers: { Authorization: `Bearer ${token}` },
  }),
  checklist: (token: string) => request<FirstSuccessChecklist>("/onboarding/checklist", {
    headers: { Authorization: `Bearer ${token}` },
  }),
  startOver: (token: string) => request<void>("/onboarding/start-over", {
    method: "POST", headers: { Authorization: `Bearer ${token}` },
  }),
}

// ── Public profile (Shareability v1) ──────────────────────────────────────────

export interface PublicProfile {
  ninja_name: string
  mirror_score: number | null
  domain_scores: Record<string, number> | null
  tier_label: string | null
  forge_sessions_count: number
  diary_count: number
  tracker_count: number
}

export interface JobOverlapRow {
  job_id: string
  role: string | null
  company_name: string | null
  viewer_match_pct: number | null
  owner_match_pct: number | null
  viewer_status: string | null
  owner_status: string | null
}

export interface JobOverlapResponse {
  rows: JobOverlapRow[]
}

export const profile = {
  public: (ninjaName: string) =>
    request<PublicProfile>(`/profile/${encodeURIComponent(ninjaName)}`),
  overlap: (ninjaName: string, token: string) =>
    request<JobOverlapResponse>(`/profile/${encodeURIComponent(ninjaName)}/overlap`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
}

// ── CV ────────────────────────────────────────────────────────────────────────

/** ADR-0004 — POST /cv/upload returns a discriminated union (see cv-upload-state). */
export type CVUploadResponse = CVUploadInitial
export type CVUploadStatusResponse = CVUploadPolledStatus
export type CVUploadResult = CVUploadResultShape
export const CVUploadFailure = CVUploadFailureBase

export interface CVEvidenceSummary {
  evidence_count: number
  diary_entries_count: number
  skill_upgrades_count: number
  score_delta: number | null
  current_score: number | null
  last_cv_score: number | null
  next_version_number: number
}

export interface CVEducationItem {
  institution: string
  degree: string
  dates: string
  grade: string
  location: string
}

export interface CVExperienceItem {
  company: string
  role: string
  dates: string
  location: string
  bullets: string[]
}

export interface CVProjectItem {
  name: string
  dates: string
  bullets: string[]
}

export interface CVContact {
  name: string
  title: string
  email: string
  phone: string
  location: string
  linkedin: string
}

export interface CVStructured {
  /** Printed CV identity. Optional only for legacy rows created before 2026-06-19. */
  contact?: CVContact
  summary: string | null
  education: CVEducationItem[]
  experience: CVExperienceItem[]
  projects: CVProjectItem[]
  skills_line: string | null
  certs: string[]
}

export interface MasterSaveResponse {
  baseline_id: number
  user_version_number: number
  recompute_pending: boolean
}

export interface MasterRevision {
  id: number
  revision_number: number
  created_at: string
  cv_structured: CVStructured
}

/** One entry in the Delta-4 version history — a CV the user APPLIED with. */
export interface AppliedVersion {
  id: string
  job_id: string | null
  cv_version_id: number | null
  cv_snapshot: {
    text?: string
    title?: string
    company?: string
    score?: number
    bullets?: number
    words?: number
    structured?: CVStructured
    hidden?: string[]
  }
  applied_url: string | null
  submitted_at: string | null
}

export type CVVersionKind = "baseline_upload" | "deterministic" | "polished" | "edited"

export interface CVVersion {
  id: number
  user_version_number: number
  kind: CVVersionKind
  job_id: string | null
  parent_version_id: number | null
  baseline_version_id: number | null
  title: string | null
  hidden_items: string[]
  edited_items: Record<string, string>
  cv_structured?: CVStructured | null
  body_text: string
  polished_text: string | null
  ai_polished: boolean
  created_at: string
  job_title: string | null
  company_name: string | null
  footer_mark_hidden: boolean
}

export interface SkillEditRequest {
  skill_key: string
  new_text: string
  section_hint?: string
  item_index?: number
  bullet_index?: number
}

export interface SkillEditCandidate {
  section: string
  item_index: number
  bullet_index: number
  text: string
  label: string
}

export interface SkillEditResponse {
  baseline_id: number
  user_version_number: number
  body_text: string
  title: string
  dropped_skill_keys: string[]
  recompute_pending: boolean
  conflict?: false
}

export interface SkillEditConflictDetail {
  code: "multi_match"
  skill_key: string
  candidates: SkillEditCandidate[]
}

export type SkillEditConflict = SkillEditConflictDetail & { conflict: true }

// Combine two near-duplicate bullets into one — Myro Mentor (same no-DELETION
// guard as rewrite, applied to the concatenated pair).
export interface MergeBulletResponse {
  mode: "merge" | "lossy" | "error"
  merged_text?: string | null
  /** Named facts a "lossy" merge would drop — the receipts for the eyes-open choice. */
  drops?: string[]
  rationale?: string | null
  citations?: string[]
}

export interface CVUploadFallbackSubmissionRequest {
  attempts: number
  reason_code: string
  last_error?: string
  file_name?: string
  file_mime?: string
  file_size_bytes?: number
  route?: string
  assignment_deadline?: string
}

export interface CVUploadFallbackSubmissionResponse {
  ticket_id: string
  support_token: string
  alternate_submission_url: string
  sla_hours: number
}

export interface RewriteBulletResponse {
  mode: "rewrite" | "question" | "suggest_metric" | "error"
  rewritten_text?: string | null
  question?: string | null
  rationale?: string | null
  // A real number found in the user's own stories (suggest_metric) — offered with
  // provenance so they confirm before it lands, never invented, never silent.
  candidate_value?: string | null
  candidate_source?: string | null
  // Internal grounding record — not shown on the card (grounding is method, not
  // the user's concern).
  citations?: string[]
}

export interface RewriteVariant {
  angle: "metric" | "impact" | "scope" | "weave"
  label: string
  text: string
  // Plain candidate-facing reason this framing is strong ("leads with the 40% result").
  why?: string
}

// Recommended + alternates rewrite: framings of the same real facts, strongest-first
// (variants[0] = the Mentor's recommendation).
export interface RewriteVariantsResponse {
  mode: "variants" | "question" | "suggest_metric" | "error"
  variants: RewriteVariant[]
  question?: string | null
  rationale?: string | null
  candidate_value?: string | null
  candidate_source?: string | null
  citations?: string[]
}

// Whole-CV "Restructure with Mentor" (DESIGN_cv_playground_redesign §6.2, CVJT1).
export interface RestructureProposalResponse {
  mode: "proposal" | "error"
  proposed_text?: string | null
  changes: string[]
  rationale?: string | null
  playbook?: string | null
  uncertainty?: string | null
  cost: number               // Myro Coins charged only when the user keeps it
}

// Skills-section refresh — keep the CV SKILLS line current with the living skill
// graph, primary-first. FREE + stateless; the kept line is applied into the
// living-master autosave draft (no new baseline, no charge).
export interface SkillsRefreshAdded { display_name: string; reason: string }
export interface SkillsRefreshResponse {
  primary: string[]
  secondary: string[]
  added: SkillsRefreshAdded[]
  proposed_skills_line: string
  changed: boolean
  job_title?: string | null
}

// Gap-driven rewrite session ("Close gaps with Mentor"). The plan endpoint
// classifies each job-skill gap and returns the honest session: surface a latent
// skill onto its host bullet, route an absent one to Forge, surface a shallow one
// ONE level (capped), and the flywheel upgrade when practice out-paced the CV.
export interface GapSkillRef { skill: string; display_name: string }
export interface HostBulletCard {
  order: number
  section: string
  item_index: number
  bullet_index: number
  bullet_text: string
  skills: GapSkillRef[]
}
export interface GapHostBullet {
  section: string
  item_index: number
  bullet_index: number
  bullet_text: string
}
export interface BelowLevelCard {
  order: number
  skill: string
  display_name: string
  current_level: number
  required_level: number
  surface_to: number
  is_primary: boolean
  // Located host bullet when the skill's evidence can be surfaced one notch;
  // null → practice-only (earn the level in Forge, flywheel surfaces it later).
  host: GapHostBullet | null
}
export interface AbsentSkill {
  skill: string
  display_name: string
  is_primary: boolean
  required_level: number
}
export interface UpgradeOffer {
  skill: string
  display_name: string
  from_level: number
  to_level: number
  // Located host bullet when CV evidence exists → claim it one-tap in the closing
  // panel; null → no evidence on the CV yet, the offer routes to practice instead.
  host: GapHostBullet | null
}
export interface GapPlanResponse {
  job_id: string
  job_title: string
  company: string | null
  host_bullet_cards: HostBulletCard[]
  below_level_cards: BelowLevelCard[]
  absent_skills: AbsentSkill[]
  upgrade_offers: UpgradeOffer[]
  total_actionable: number
  shown: number
  remaining: number
}

// "Add from your experience" — POST /cv/intake-draft. Mentor shapes the user's
// own words into JD-aligned bullets, each mapped to the gap skills it shows and
// the best-fit existing role (role_index into the roles[] the client passed).
export interface IntakeBullet {
  text: string
  skills_covered: string[]
  role_index: number | null
  needs_metric: boolean
}
export interface IntakeDraftResponse {
  mode: "draft" | "error"
  bullets: IntakeBullet[]
  rationale: string | null
}

// Experience Reservoir (v2) — GET /cv/reservoir. The master CV as a curatable
// inventory: roles → points → phrasing variants (canonical first).
export type PointSource = "migration" | "gap_session" | "forge" | "manual" | "restructure"
export interface PointVariant {
  id: string
  text: string
  audience_tags: string[]
  source: PointSource
  is_canonical: boolean
}
export interface ReservoirPoint {
  point_key: string
  variants: PointVariant[]
  /** Canonical phrasing states no measurable result (no-fabrication guard mirror). */
  needs_impact: boolean
}
export interface ReservoirRole {
  role_id: string
  kind: "experience" | "project"
  title: string
  org: string | null
  dates: string | null
  points: ReservoirPoint[]
}
export interface ReservoirView {
  roles: ReservoirRole[]
  summary: string | null
  skills_line: string | null
  certs: string[]
}

// Career Story Reservoir — the comprehensive profile built from the user's dump
// (old CVs, LinkedIn export, notes): roles → STAR stories → canonical pointers.
export interface CareerStoryMetric { value: string; what: string }
export interface CareerStory {
  id: string
  kind: "project" | "achievement" | "accolade" | "education" | "research" | "other"
  title: string
  narrative: Partial<Record<"situation" | "task" | "action" | "result", string>>
  metrics: CareerStoryMetric[]
  skills: string[]
  status: "active" | "archived"
  /** Canonical CV line projected from this story ("" when none yet). */
  pointer: string
  variant_count: number
}
export interface CareerProfileRole {
  id: string
  company: string
  title: string
  location: string
  date_label: string
  kind: "work" | "education" | "leadership" | "volunteer" | "other"
  stories: CareerStory[]
}
export interface CareerProfile {
  roles: CareerProfileRole[]
  /** Role-less stories: accolades, olympiads, competitions. */
  highlights: CareerStory[]
  competencies: string[]
  story_count: number
  /** Dumped files still being read — poll while > 0. */
  pending_inflows: number
  /** Judge-proposed same-role pairs awaiting the user's ruling (#38). */
  merge_suggestions: MergeSuggestion[]
  /** Auto-folded duplicate roles in the last 7 days — the visible receipt. */
  tidied_roles: number
}
export interface MergeSuggestion {
  role_a: string
  role_b: string
  a_label: string
  b_label: string
}
export interface CareerIngestResponse {
  entries: { id: string; filename: string | null; kind: string; chars: number }[]
  skipped: { filename: string; reason: string }[]
  /** LinkedIn connections found in the dump, saved for warm intros (undoable). */
  connections_saved: number
}
export interface CareerProjectResponse {
  version_id: number
  included: number
  parked: number
}

/** Lane C — the JD-interview coverage panel. */
export type CoverageStatus = "covered" | "weak" | "gap"
export interface CoverageRow {
  requirement: string
  status: CoverageStatus
  story_id: string | null
  story_title: string
  story_pointer: string
}
export interface JDCoverageResponse {
  requirements: CoverageRow[]
  covered: number
  weak: number
  gap: number
  /** Served from the per-(user, job) cache — requirements stay stable per job. */
  cached: boolean
  computed_at: string
}

// ── Tailor with Mentor weave (Lane C v2, grill locks 2026-07-16) ──────────────

/** A mined candidate answer for one interview ask — the user's OWN story or an
 *  on-CV line, never invented (grounded by construction). */
export interface WeaveOption {
  kind: "story" | "cv"
  label: string
  detail: string
  story_id: string | null
}
export interface WeaveQuestion {
  requirement: string
  status: "weak" | "gap"
  options: WeaveOption[]
}
export interface WeaveInterviewResponse {
  questions: WeaveQuestion[]
  requirements_total: number
  unproven: number
  cost: number
}
export interface WeaveAnswerResponse {
  /** ONE pointed probe back on a thin answer — nothing banked yet. */
  follow_up: string | null
  entry_id: string | null
}
export interface WeaveBullet {
  text: string
  /** The old CV lines this line was reworked from (provenance). */
  from_lines: string[]
  story_titles: string[]
  used_answer: boolean
}
export interface WeaveRole {
  role_index: number
  role: string
  company: string
  changed: boolean
  /** Honesty guard rejected the rework — original lines kept. */
  guarded: boolean
  why: string
  bullets: WeaveBullet[]
  dropped_lines: string[]
}
export interface WeaveProposal {
  fingerprint: string
  summary: string | null
  skills_line: string | null
  roles: WeaveRole[]
  changed_roles: number
  requirements_total: number
  asks_unproven: number
  computed_at: string
}
export interface WeaveRunResponse {
  proposal: WeaveProposal
  cached: boolean
  /** The master changed since this draft — apply would 409; offer a re-run. */
  stale: boolean
  cost: number
  new_coin_balance: number | null
}
export interface WeaveGetResponse {
  purchased: boolean
  proposal: WeaveProposal | null
  stale: boolean
}

/** One entry in the persistent brain-dump notebook (User Memory Phase 3). */
export interface DumpEntry {
  id: string
  text: string
  /** Which surface authored it: "manual" (hand-typed) | "job_intent" (Tell Myro) | … */
  source?: string
  created_at: string
}

/** One remembered fact in the user_memory store (authored or distilled). */
export type MemoryKind =
  | "aspiration" | "constraint" | "habit" | "preference"
  | "salary" | "work_mode" | "target_company" | "note"
export interface MemoryFact {
  id: string
  kind: MemoryKind
  text: string
  source: "authored" | "distilled"
  status: "active" | "dismissed"
  created_at: string
}

/** Token-scoped CRUD over what Myro remembers (the Memory panel on /cv). */
export const memory = {
  list: (token: string) =>
    request<{ facts: MemoryFact[] }>("/memory", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  add: (token: string, kind: MemoryKind, text: string) =>
    request<MemoryFact>("/memory", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind, text }),
    }),
  update: (token: string, id: string, patch: { text?: string; status?: "active" | "dismissed" }) =>
    request<MemoryFact>(`/memory/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    }),
  remove: (token: string, id: string) =>
    request<void>(`/memory/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** The persona canvas — "What Myro knows about you" (Lane B). */
  persona: (token: string) =>
    request<PersonaResponse>("/memory/persona", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** Edit a canvas paragraph. Edits are law: the paragraph becomes the user's
   *  words, pinned, and survives every regeneration. */
  personaEdit: (token: string, paragraphId: string, patch: { text?: string; pinned?: boolean }) =>
    request<PersonaParagraph>(`/memory/persona/paragraphs/${encodeURIComponent(paragraphId)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    }),
  personaRefresh: (token: string) =>
    request<{ scheduled: boolean }>("/memory/persona/refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
}

/** Career Profile — the recruiter/logistics fact-layer (comp / notice / quota /
 *  targets / reporting line / availability / experience splits). Captured once,
 *  reused: extension ATS auto-fill + persona/Prep/₹99 surfacing. All optional —
 *  capture is progressive. Numeric keys are typed so the extension fills clean
 *  values, not parsed prose. */
export interface CareerProfileData {
  total_experience_years?: number | null
  bd_experience_years?: number | null
  it_services_years?: number | null
  gcc_bd_years?: number | null
  current_ctc_fixed_lpa?: number | null
  current_ctc_variable_lpa?: number | null
  expected_ctc_lpa?: number | null
  notice_period_days?: number | null
  current_location?: string | null
  open_to_relocate?: boolean | null
  interview_availability?: string | null
  sales_target?: string | null
  target_achievement?: string | null
  new_logos_last_year?: number | null
  reporting_manager?: string | null
  reason_for_change?: string | null
  notes?: string | null
}
export interface CareerProfileResponse {
  profile: CareerProfileData
  updated_at: string | null
  /** Reservoir-derived pre-fill the user hasn't confirmed yet (S2). */
  suggested?: CareerProfileData | null
}

/** Token-scoped read/write of the caller's Career Profile. */
export const careerProfile = {
  get: (token: string) =>
    request<CareerProfileResponse>("/career-profile", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** PATCH semantics: supplied keys merge, absent keys untouched, explicit null
   *  clears a key. */
  update: (token: string, profile: Partial<CareerProfileData>) =>
    request<CareerProfileResponse>("/career-profile", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ profile }),
    }),
}

/** Persona canvas (Lane B) — one living document in three movements. */
export type PersonaMovement = "past" | "present" | "future"
export interface PersonaParagraph {
  id: string
  movement: PersonaMovement
  text: string
  author: "myro" | "user"
  pinned: boolean
  /** Resolved signal lines this paragraph draws on — the visible trace. */
  grounds: string[]
}
export interface PersonaTimelineRole {
  company: string
  title: string
  date_label: string
  started_on: string | null
}
export interface PersonaResponse {
  status: "ready" | "pending"
  paragraphs: PersonaParagraph[]
  generated_at: string | null
  timeline: PersonaTimelineRole[]
  cosmos: "none" | "on_file"
}

export const cv = {
  evidence: (token: string) =>
    request<CVEvidenceSummary>("/cv/evidence", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** Brain-dump notebook (Phase 3) — the durable "what I've done / what I want"
   *  notepad that feeds distillation + CV-bullet intake. */
  dump: {
    list: (token: string) =>
      request<{ entries: DumpEntry[] }>("/cv/dump", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    add: (token: string, text: string, source?: string) =>
      request<DumpEntry>("/cv/dump", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(source ? { text, source } : { text }),
      }),
    remove: (token: string, id: string) =>
      request<void>(`/cv/dump/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }),
  },
  structured: (token: string) =>
    request<CVStructured>("/cv/structured", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  // PR-3 living-master autosave. Cheap mutate (no LLM, no XP). Server snapshots
  // prior content to history, then async re-tags → recompute_finished_at (SE17).
  saveMaster: (token: string, structured: CVStructured) =>
    request<MasterSaveResponse>("/cv/master", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(structured),
    }),
  // Propose a current, primary-first SKILLS section from the living skill graph.
  // FREE + read-only; pass jobId to lead with that job's required skills.
  skillsRefresh: (token: string, jobId?: string | null) =>
    request<SkillsRefreshResponse>("/cv/skills-refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ job_id: jobId ?? null }),
    }),
  masterRevisions: (token: string) =>
    request<{ revisions: MasterRevision[] }>("/cv/master/revisions", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  restoreMasterRevision: (token: string, revisionId: number) =>
    request<MasterSaveResponse>(`/cv/master/revisions/${revisionId}/restore`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  requestUploadFallback: (
    token: string,
    body: CVUploadFallbackSubmissionRequest,
  ) =>
    request<CVUploadFallbackSubmissionResponse>("/cv/upload/fallback", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  versions: {
    list: (token: string, jobId?: string | null) => {
      const q = jobId ? `?job_id=${encodeURIComponent(jobId)}` : ""
      return request<{ versions: CVVersion[] }>(`/cv/versions${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    },
    create: (token: string, jobId: string, hiddenItems: string[], title?: string) =>
      request<CVVersion>("/cv/versions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ job_id: jobId, hidden_items: hiddenItems, title }),
      }),
    polish: (token: string, versionId: number) =>
      request<CVVersion>(`/cv/versions/${versionId}/polish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: LLM_REQUEST_TIMEOUT_MS,
      }),
    // Whole-CV Restructure: propose is FREE + stateless; keep charges 20 coins.
    restructure: (token: string, versionId: number) =>
      request<RestructureProposalResponse>(`/cv/versions/${versionId}/restructure`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: LLM_REQUEST_TIMEOUT_MS,
      }),
    restructureApply: (
      token: string,
      versionId: number,
      body: { proposed_text: string; proposal_id: string },
    ) =>
      request<CVVersion>(`/cv/versions/${versionId}/restructure/apply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
    edit: (
      token: string,
      versionId: number,
      editedItems: Record<string, string>,
      title?: string,
    ) =>
      request<CVVersion>(`/cv/versions/${versionId}/edit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ edited_items: editedItems, title }),
    }),
    structuredEdit: (
      token: string,
      versionId: number,
      structured: CVStructured,
      title?: string,
    ) =>
      request<CVVersion>(`/cv/versions/${versionId}/structured`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cv: structured, title }),
      }),
    // Toggle the Myro footer mark on a CV Version (certified ⇄ un-certified).
    setFooterMark: (token: string, versionId: number, hidden: boolean) =>
      request<CVVersion>(`/cv/versions/${versionId}/footer-mark`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ hidden }),
      }),
    // Option C auto-save: persist the job projection (shown bullets) in place on
    // the deterministic working draft — no new snapshot row, no Save button.
    updateHiddenItems: (token: string, versionId: number, hiddenItems: string[]) =>
      request<CVVersion>(`/cv/versions/${versionId}/hidden-items`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ hidden_items: hiddenItems }),
      }),
    // Delta-4 promote: the applied CV's shape becomes the living master, so it
    // persists + seeds every future tailoring (project_living_cv_delta4).
    promoteMaster: (token: string, hiddenItems: string[]) =>
      request<CVVersion>(`/cv/versions/promote-master`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ hidden_items: hiddenItems }),
      }),
    // Delta-4 restore: make a past applied CV the living master again.
    restoreMaster: (token: string, body: { cv: CVStructured; hidden_items: string[] }) =>
      request<CVVersion>(`/cv/versions/restore-master`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
  },
  skillEdit: async (
    token: string,
    body: SkillEditRequest,
  ): Promise<SkillEditResponse | SkillEditConflict> => {
    const res = await fetch(`${BASE}/cv/skill-edit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (res.status === 409) {
      const payload = await res.json().catch(() => ({})) as { detail?: unknown }
      const detail = payload.detail
      if (detail && typeof detail === "object" && "candidates" in detail) {
        return { conflict: true, ...(detail as SkillEditConflictDetail) }
      }
      throw new Error(typeof detail === "string" ? detail : "CV no longer matches that skill — refresh.")
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(extractError(err, res.status))
    }
    return res.json() as Promise<SkillEditResponse>
  },
  recomputeStatus: (token: string, baselineId: number) =>
    request<{ baseline_id: number; recompute_finished_at: string | null }>(
      `/cv/skill-edit/recompute-status/${baselineId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
  // Per-bullet Mentor rewrite (suggest = stateless proposal / no-fab question).
  rewriteBullet: (
    token: string,
    body: { bullet: string; role?: string | null; missing_keywords: string[]; metric?: string | null; allow_no_metric?: boolean },
  ) =>
    request<RewriteBulletResponse>("/cv/rewrite-bullet", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      timeoutMs: LLM_REQUEST_TIMEOUT_MS,
    }),
  /** SSE path for the streamed bullet rewrite (ADR-0009). POST body = the same
   * shape as rewriteBullet; fed to useStreamingText.start(path, token, onDone, body).
   * Tokens are the rewritten text; the terminal `done` frame carries
   * {mode, question?, rationale?, citations?}. */
  rewriteBulletStreamPath: "/cv/rewrite-bullet/stream",
  // Recommended + alternates rewrite (strongest-first), or the no-fab question /
  // reservoir-number offer. intent="weave" (Surface-skill fixes) = one minimal
  // keyword-insertion edit instead of the reframe. Strong writer floor server-side —
  // output is finished CV lines, never streamed reasoning.
  rewriteBulletVariants: (
    token: string,
    body: { bullet: string; role?: string | null; missing_keywords: string[]; metric?: string | null; allow_no_metric?: boolean; intent?: "weave" },
  ) =>
    request<RewriteVariantsResponse>("/cv/rewrite-bullet/variants", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      timeoutMs: LLM_REQUEST_TIMEOUT_MS,
    }),
  // Plan the gap-driven session for a job: classify each gap → cards. Stateless,
  // free, writes nothing; accepts go through rewriteBullet/rewriteApply above.
  gapPlan: (token: string, jobId: string) =>
    request<GapPlanResponse>(`/cv/${jobId}/gap-plan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: LLM_REQUEST_TIMEOUT_MS,
    }),
  // "Add from your experience": shape the user's own words into JD-aligned bullets,
  // mapped to gap skills + best-fit role. Stateless/free; accepts write via saveMaster.
  intakeDraft: (
    token: string,
    body: { raw_text: string; jd_text?: string | null; gap_skills?: string[]; roles?: string[] },
  ) =>
    request<IntakeDraftResponse>("/cv/intake-draft", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      timeoutMs: LLM_REQUEST_TIMEOUT_MS,
    }),
  // Weave a user-supplied real number into a drafted bullet (Myro never invents it).
  intakePlaceMetric: (token: string, body: { bullet: string; metric: string }) =>
    request<{ text: string }>("/cv/intake-place-metric", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      timeoutMs: LLM_REQUEST_TIMEOUT_MS,
    }),
  // Freeze the submitted CV against a job on Apply (CVJT1 immutable attempt).
  applySnapshot: (
    token: string,
    body: { job_id: string; cv_snapshot: Record<string, unknown>; cv_version_id?: number | null; applied_url?: string | null },
  ) =>
    request<{ id: string; submitted_at: string | null }>("/cv/apply-snapshot", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  /** Delta-4 version history: every CV the user applied with, newest first. */
  appliedVersions: (token: string) =>
    request<{ versions: AppliedVersion[] }>("/cv/apply-snapshots", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** Career Story Reservoir — dump in, comprehensive profile out, project per job. */
  career: {
    profile: (token: string) =>
      request<CareerProfile>("/cv/reservoir/profile", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    /** Multipart by design (files) — bypasses request()'s forced JSON header. */
    ingest: async (token: string, files: File[], text?: string): Promise<CareerIngestResponse> => {
      const form = new FormData()
      for (const f of files) form.append("files", f)
      if (text && text.trim()) form.append("text", text)
      const res = await fetch(`${BASE}/cv/reservoir/ingest`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        body: form,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new ApiError(extractError(body, res.status), { status: res.status, kind: "http" })
      }
      return res.json() as Promise<CareerIngestResponse>
    },
    patchStory: (token: string, storyId: string, patch: Partial<Pick<CareerStory, "status" | "title" | "skills">> & { narrative?: Record<string, string> }) =>
      request<CareerStory>(`/cv/reservoir/stories/${encodeURIComponent(storyId)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      }),
    project: (token: string, jobId: string) =>
      request<CareerProjectResponse>("/cv/reservoir/project", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ job_id: jobId }),
      }),
    /** Lane C: "What this job wants" — JD requirements classified against the
     *  user's stories (covered / weak / gap). */
    jdCoverage: (token: string, jobId: string, opts?: { refresh?: boolean }) =>
      request<JDCoverageResponse>("/cv/jd-coverage", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ job_id: jobId, refresh: opts?.refresh ?? false }),
      }),
    /** A gap answer → a NEW career story via the dump pipeline. */
    jdCoverageAnswer: (token: string, requirement: string, answer: string, jobId?: string) =>
      request<{ entry_id: string }>("/cv/jd-coverage/answer", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requirement, answer, job_id: jobId ?? null }),
      }),
    /** Rule on a judge-proposed same-role pair (#38) — a human ruling is law. */
    mergeVerdict: (token: string, roleA: string, roleB: string, verdict: "merged" | "keep_separate") =>
      request<{ verdict: string }>("/cv/reservoir/roles/merge-verdict", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role_a: roleA, role_b: roleB, verdict }),
      }),
  },
  /** "Tailor with Mentor" — the draft-first whole-CV weave for one job.
   *  Interview + answer-banking + apply are free; the weave RUN is 50 coins,
   *  charged on delivery only (a cached proposal replays free). */
  weave: {
    interview: (token: string, jobId: string) =>
      request<WeaveInterviewResponse>("/cv/weave/interview", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ job_id: jobId }),
      }),
    answer: (token: string, body: { requirement: string; answer: string; jobId?: string; final?: boolean }) =>
      request<WeaveAnswerResponse>("/cv/weave/answer", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          requirement: body.requirement, answer: body.answer,
          job_id: body.jobId ?? null, final: body.final ?? false,
        }),
      }),
    run: (token: string, jobId: string, answers: { requirement: string; text: string }[], opts?: { refresh?: boolean }) =>
      request<WeaveRunResponse>("/cv/weave", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ job_id: jobId, answers, refresh: opts?.refresh ?? false }),
      }),
    get: (token: string, jobId: string) =>
      request<WeaveGetResponse>(`/cv/weave/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    apply: (token: string, jobId: string, acceptedRoles: number[], opts?: { acceptSummary?: boolean; acceptSkillsLine?: boolean }) =>
      request<{ version_id: number }>("/cv/weave/apply", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          job_id: jobId, accepted_roles: acceptedRoles,
          accept_summary: opts?.acceptSummary ?? true,
          accept_skills_line: opts?.acceptSkillsLine ?? true,
        }),
      }),
  },
  // The experience reservoir inventory (v2): roles → points → phrasing variants.
  reservoir: (token: string) =>
    request<ReservoirView>("/cv/reservoir", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  // Apply an accepted rewrite — writes a new baseline (mirrors skill-edit).
  rewriteApply: (
    token: string,
    body: { old_text: string; new_text: string; section_hint?: string | null; item_index?: number | null; bullet_index?: number | null },
  ) =>
    request<SkillEditResponse>("/cv/rewrite-bullet/apply", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  // Propose a combined line for two selected bullets. Stateless, free.
  mergeBullet: (token: string, body: { bullet_a: string; bullet_b: string; role?: string | null }) =>
    request<MergeBulletResponse>("/cv/merge-bullet", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      timeoutMs: LLM_REQUEST_TIMEOUT_MS,
    }),
  // Apply an accepted merge — writes a new baseline (mirrors rewriteApply).
  mergeBulletApply: (
    token: string,
    body: {
      old_text_a: string; old_text_b: string; merged_text: string
      section_hint: string; item_index: number; bullet_index_a: number; bullet_index_b: number
    },
  ) =>
    request<SkillEditResponse>("/cv/merge-bullet/apply", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  // WYSIWYG PDF export — the ONLY CV→PDF path (ADR-0020). The body carries the
  // literal rendered .cvb-pdf-page outerHTML — the SAME DOM the user previewed —
  // and headless Chromium renders it server-side with the shared sheet
  // stylesheet, so the PDF is byte-faithful to the preview. On 503 the caller
  // falls back to the browser's native Save-as-PDF (printCvPage).
  exportPdf: async (
    token: string,
    body: { html: string; filename: string },
  ): Promise<Blob> => {
    const res = await fetch(`${BASE}/cv/export-pdf`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const msg = await res.text().catch(() => "PDF generation failed")
      throw new Error(msg)
    }
    return res.blob()
  },
  // Structured DOCX export. The body carries the ALREADY-VISIBLE sections
  // (selectVisibleCV applied client-side) so the .docx matches the on-screen
  // sheet exactly — same single source of truth as the WYSIWYG PDF.
  exportDocx: async (
    token: string,
    body: {
      visible: import("@/lib/cv/visible-cv").VisibleCV
      contact: { name: string; title: string; location: string; email: string; phone: string; linkedin: string }
      template: string
      company?: string
      filename: string
    },
  ): Promise<Blob> => {
    const res = await fetch(`${BASE}/cv/export-docx`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const msg = await res.text().catch(() => "DOCX generation failed")
      throw new Error(msg)
    }
    return res.blob()
  },
}

/**
 * uploadCV runs the full ADR-0004 two-phase flow end-to-end:
 *   1. POST /cv/upload — fast (~1s): validates, charges XP, queues LLM work
 *   2. If processing: polls GET /cv/upload/status/{job_id} until terminal state
 *
 * Throws CVUploadFailure on terminal "failed" so the caller can surface the
 * refund context. Throws Error for transport / 4xx errors.
 */
const CV_UPLOAD_TELEMETRY_PATH = "/v1/telemetry/cv-upload-phase"

/** Returns the in-flight job_id stored from a prior session, if any. */
export function getPersistedCVUploadJobId(): string | null {
  return readCVUploadJob()
}

export function clearPersistedCVUploadState(opts: { clearIdem?: boolean } = {}): void {
  clearCVUploadPersistence(opts.clearIdem ?? true)
}

type CVUploadTelemetryPhase = "pick" | "signed-url" | "put" | "poll" | "parse"
type CVUploadTelemetryOutcome = "started" | "succeeded" | "failed" | "retrying" | "skipped"

function _routePath(): string | null {
  if (typeof window === "undefined") return null
  return window.location.pathname
}

function _networkType(): string | null {
  if (typeof navigator === "undefined") return null
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string }
    mozConnection?: { effectiveType?: string }
    webkitConnection?: { effectiveType?: string }
  }
  return nav.connection?.effectiveType ?? nav.mozConnection?.effectiveType ?? nav.webkitConnection?.effectiveType ?? null
}

function _emitCVUploadTelemetry(
  token: string,
  payload: {
    phase: CVUploadTelemetryPhase
    outcome: CVUploadTelemetryOutcome
    attempt?: number
    jobId?: string | null
    idempotencyKey?: string | null
    reasonCode?: string | null
    errorDetail?: string | null
    httpStatus?: number | null
    fileName?: string | null
    fileMime?: string | null
    fileBytes?: number | null
    route?: string | null
  },
): void {
  if (!BASE) return
  const body = JSON.stringify({
    phase: payload.phase,
    outcome: payload.outcome,
    attempt: payload.attempt ?? null,
    job_id: payload.jobId ?? null,
    idempotency_key: payload.idempotencyKey ?? null,
    reason_code: payload.reasonCode ?? null,
    error_detail: payload.errorDetail ?? null,
    http_status: payload.httpStatus ?? null,
    file_name: payload.fileName ?? null,
    file_mime: payload.fileMime ?? null,
    file_size_bytes: payload.fileBytes ?? null,
    route: payload.route ?? _routePath(),
    network_type: _networkType(),
  })
  fetch(`${BASE}${CV_UPLOAD_TELEMETRY_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body,
    keepalive: true,
  }).catch(() => {})
}

function _asUploadFailure(err: unknown, phase: CVUploadTelemetryPhase): CVUploadFailureBase {
  if (err instanceof CVUploadFailureBase) return err
  if (err instanceof Error) {
    return new CVUploadFailureBase(err.message, "upload_unknown_error", false, null, false, phase)
  }
  return new CVUploadFailureBase("Upload failed unexpectedly. Tap to try again.", "upload_unknown_error", false, null, true, phase)
}

export type CVUploadSource = "pdf_upload" | "text_describe" | "linkedin_pdf" | "generated_baseline"

export async function beginCVUpload(
  token: string,
  file: File,
  source: CVUploadSource = "pdf_upload",
  // Real bytes-sent percentage from the resumable transfer. The upload screen
  // shows it because the transfer is the multi-second part the user actually
  // waits through, and a static "Reading your CV…" over it reads as a hang.
  // Absent on the multipart fallback, which has no progress to report.
  onTransferProgress?: (pct: number) => void,
): Promise<{ initial: CVUploadResponse; file: File }> {
  const idempotencyKey = readCVUploadIdempotencyKey() ?? createCVUploadIdempotencyKey()
  persistCVUploadIdempotencyKey(idempotencyKey)
  const safeFile = await _normalizeUploadFile(file)
  // Durable "we've got it" hold (weak-radio resilience). A retryable interrupt
  // leaves the stash so the /cv resume effects can replay it on next visit with
  // the same Idempotency-Key (CVUP1 dedup). Cleared once the bytes land.
  // Owner-bound: resume only ever replays it for the account that picked it.
  await stashPendingCVUpload({ file: safeFile, source, idempotencyKey, ownerSub: jwtSub(token) })
  let initial: CVUploadResponse
  try {
    initial = await _transferCV(token, safeFile, idempotencyKey, source, onTransferProgress)
  } catch (err) {
    const retryable = err instanceof CVUploadFailureBase ? err.retryable : false
    if (!retryable) await clearPendingCVUpload()
    throw err
  }
  if (initial.status === "processing" && initial.job_id) persistCVUploadJob(initial.job_id)
  await clearPendingCVUpload()
  return { initial, file: safeFile }
}

export async function uploadCV(
  token: string,
  file: File,
  source: CVUploadSource = "pdf_upload",
  onProgress?: (status: CVUploadStatusResponse) => void,
): Promise<CVUploadResult> {
  const idempotencyKey = readCVUploadIdempotencyKey() ?? createCVUploadIdempotencyKey()
  persistCVUploadIdempotencyKey(idempotencyKey)
  _emitCVUploadTelemetry(token, {
    phase: "pick",
    outcome: "started",
    idempotencyKey,
    fileName: file.name,
    fileMime: file.type,
    fileBytes: file.size,
  })
  let safeFile: File
  try {
    safeFile = await _normalizeUploadFile(file)
    _emitCVUploadTelemetry(token, {
      phase: "pick",
      outcome: "succeeded",
      idempotencyKey,
      fileName: safeFile.name,
      fileMime: safeFile.type,
      fileBytes: safeFile.size,
    })
  } catch (err) {
    const failure = _asUploadFailure(err, "pick")
    _emitCVUploadTelemetry(token, {
      phase: "pick",
      outcome: "failed",
      idempotencyKey,
      reasonCode: failure.code,
      errorDetail: failure.message,
      fileName: file.name,
      fileMime: file.type,
      fileBytes: file.size,
    })
    clearCVUploadPersistence(true)
    throw failure
  }

  // "We've got it": hold the picked file durably BEFORE the vulnerable phase-1
  // POST. If the mobile radio drops the multipart mid-flight (upload_post_
  // interrupted) the throw below leaves this stash intact so the upload can
  // resume on reconnect / next app load with the SAME Idempotency-Key (CVUP1
  // dedups → no double charge). Cleared the instant the bytes land, after which
  // the server job_id (CVUP2) owns the lifecycle. Owner-bound (see PendingCVUpload).
  await stashPendingCVUpload({ file: safeFile, source, idempotencyKey, ownerSub: jwtSub(token) })
  try {
    const initial = await _transferCV(token, safeFile, idempotencyKey, source)
    if (initial.status === "processing") persistCVUploadJob(initial.job_id)
    await clearPendingCVUpload()
    const result = await _resolveUploadResult(
      token,
      initial,
      { idempotencyKey, fileName: safeFile.name, fileMime: safeFile.type, fileBytes: safeFile.size },
      onProgress,
    )
    clearCVUploadPersistence(true)
    return result
  } catch (err) {
    const failure = _asUploadFailure(err, "put")
    // Non-retryable (bad file, insufficient coins, hard 4xx) → nothing to
    // resume, drop the stash. A retryable network interrupt keeps it.
    if (!failure.retryable) {
      clearCVUploadPersistence(true)
      await clearPendingCVUpload()
    }
    throw failure
  }
}

/**
 * Resume a CV upload whose phase-1 POST never landed (flaky-radio interrupt).
 * Reads the durable file stash and replays the upload with the SAME persisted
 * Idempotency-Key (CVUP1 dedup). Returns null when nothing is pending. The
 * underlying uploadCV re-stashes and clears on success, so this is idempotent.
 */
export async function resumePendingCVUpload(
  token: string,
  onProgress?: (status: CVUploadStatusResponse) => void,
): Promise<CVUploadResult | null> {
  // A landed-but-still-parsing upload is owned by the job_id resume path, not
  // this one — don't re-POST bytes the server already has.
  if (getPersistedCVUploadJobId()) return null
  // Owner check: a stash picked under a different account is dropped, never
  // replayed into this one (2026-07-11 foreign-baseline incident).
  const pending = await readPendingCVUpload(jwtSub(token))
  if (!pending) return null
  // Pin the original key so the replay dedups against the first attempt.
  persistCVUploadIdempotencyKey(pending.idempotencyKey)
  return uploadCV(token, pending.file, pending.source, onProgress)
}

export async function uploadCVText(token: string, text: string, source: CVUploadSource = "text_describe"): Promise<CVUploadResult> {
  const idempotencyKey = readCVUploadIdempotencyKey() ?? createCVUploadIdempotencyKey()
  persistCVUploadIdempotencyKey(idempotencyKey)
  try {
    const initial = await request<CVUploadResponse>("/cv/text", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, idempotency_key: idempotencyKey, source }),
    })
    if (initial.status === "processing") persistCVUploadJob(initial.job_id)
    const result = await _resolveUploadResult(token, initial, { idempotencyKey })
    clearCVUploadPersistence(true)
    return result
  } catch (err) {
    const failure = _asUploadFailure(err, "poll")
    if (!failure.retryable) clearCVUploadPersistence(true)
    throw failure
  }
}

async function _normalizeUploadFile(file: File): Promise<File> {
  const preflight = await preflightCVUploadFile(file)
  if (!preflight.ok) {
    throw new CVUploadFailureBase(
      preflight.message,
      preflight.code,
      false,
      null,
      false,
      "pick",
    )
  }
  if (file.type === preflight.mime && file.name === preflight.safeName) return file
  return new File([file], preflight.safeName, { type: preflight.mime })
}

// 90s budget covers Railway cold-start (~20-30s worst case) + a slow 3G PUT of
// a multi-MB CV. Aligns with the beta-2 SLO: 99% of valid CVs reach a parsed
// terminal status within 90s on a 3G connection. A first AbortError triggers
// one automatic retry with the same Idempotency-Key (server dedups, never
// double-charges) so a single slow leg never becomes a user-visible failure.
const _CV_UPLOAD_POST_TIMEOUT_MS = 90_000
const _CV_UPLOAD_POST_MAX_ATTEMPTS = 3
const _CV_UPLOAD_RETRY_BACKOFF_MS = [700, 1800, 3000]

function _sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function _extractUploadError(body: unknown, status: number): {
  code: string
  message: string
  retryable: boolean
} {
  const fallbackMessage = extractError(body, status)
  let code = `upload_http_${status}`
  let message = fallbackMessage
  if (typeof body === "object" && body !== null) {
    const detail = (body as Record<string, unknown>).detail
    if (typeof detail === "object" && detail !== null) {
      const maybeCode = (detail as Record<string, unknown>).code
      const maybeMessage = (detail as Record<string, unknown>).message
      if (typeof maybeCode === "string" && maybeCode.trim()) code = maybeCode
      if (typeof maybeMessage === "string" && maybeMessage.trim()) message = maybeMessage
    }
  }
  const retryable = status >= 500 || status === 429 || code === "provider_unavailable"
  return { code, message, retryable }
}

function _wrapNetworkError(err: unknown): CVUploadFailureBase {
  const name = (err as Error)?.name
  if (name === "AbortError") {
    return new CVUploadFailureBase(
      "Upload took too long. Tap to try again.",
      "upload_post_timeout",
      false,
      null,
      true,
      "put",
    )
  }
  return new CVUploadFailureBase(
    "Upload was interrupted. Tap to try again.",
    "upload_post_interrupted",
    false,
    null,
    true,
    "put",
  )
}

/**
 * Get the CV's bytes to the backend, then return the phase-1 job response.
 *
 * Primary path = resumable, direct-to-storage (BUG-2 fix): upload straight to the
 * private Supabase bucket via TUS (a different host than our API + auto-retry +
 * cross-reload resume), then POST /cv/upload/finalize to ingest. Falls back to the
 * legacy multipart POST whenever resumable is unavailable OR the storage TRANSFER
 * fails. A finalize/pipeline rejection (bad file, insufficient coins, rate-limit) is
 * surfaced as-is — multipart would only repeat the same verdict, so we don't retry it.
 */
async function _transferCV(
  token: string,
  file: File,
  idempotencyKey: string,
  source: CVUploadSource = "pdf_upload",
  onTransferProgress?: (pct: number) => void,
): Promise<CVUploadResponse> {
  const sub = jwtSub(token)
  if (resumableUploadSupported() && sub) {
    const ext = file.type === "application/pdf" ? "pdf" : "docx"
    const objectPath = `${sub}/${idempotencyKey}.${ext}`
    const meta = { idempotencyKey, fileName: file.name, fileMime: file.type, fileBytes: file.size }
    _emitCVUploadTelemetry(token, { phase: "signed-url", outcome: "started", ...meta })
    _emitCVUploadTelemetry(token, { phase: "put", outcome: "started", attempt: 1, ...meta })
    let stored = false
    try {
      await uploadCVToStorage({ token, file, objectPath, onProgress: onTransferProgress })
      stored = true
      _emitCVUploadTelemetry(token, { phase: "put", outcome: "succeeded", attempt: 1, ...meta })
    } catch (err) {
      const wrapped = _wrapNetworkError(err)
      _emitCVUploadTelemetry(token, { phase: "put", outcome: "failed", attempt: 1, reasonCode: wrapped.code, errorDetail: wrapped.message, ...meta })
      _emitCVUploadTelemetry(token, { phase: "signed-url", outcome: "failed", reasonCode: "resumable_fallback_to_multipart", ...meta })
    }
    if (stored) {
      try {
        return await request<CVUploadResponse>("/cv/upload/finalize", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ storage_path: objectPath, idempotency_key: idempotencyKey, source }),
        })
      } catch (err) {
        // Bytes are in storage; the pipeline rejected. Falling back to multipart would
        // only re-run the identical pipeline → surface the verdict instead.
        throw _asUploadFailure(err, "parse")
      }
    }
  }
  return _postCVUpload(token, file, idempotencyKey, source)
}

async function _postCVUpload(token: string, file: File, idempotencyKey: string, source: CVUploadSource = "pdf_upload"): Promise<CVUploadResponse> {
  if (!BASE) {
    throw new CVUploadFailureBase(
      "Upload misconfigured: missing API URL. Reload the app.",
      "upload_misconfigured",
      false,
      null,
      false,
      "signed-url",
    )
  }
  const url = `${BASE}/cv/upload`
  _emitCVUploadTelemetry(token, {
    phase: "signed-url",
    outcome: "started",
    idempotencyKey,
    fileName: file.name,
    fileMime: file.type,
    fileBytes: file.size,
  })
  _emitCVUploadTelemetry(token, {
    phase: "signed-url",
    outcome: "skipped",
    idempotencyKey,
    reasonCode: "direct_multipart_post",
    fileName: file.name,
    fileMime: file.type,
    fileBytes: file.size,
  })
  const buildForm = (): FormData => {
    const f = new FormData()
    f.append("file", file)
    return f
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Idempotency-Key": idempotencyKey,
    "X-Myro-CV-Source": source,
  }
  const attempt = async (authToken: string): Promise<Response> => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), _CV_UPLOAD_POST_TIMEOUT_MS)
    try {
      return await fetch(url, {
        method: "POST",
        headers: { ...headers, Authorization: `Bearer ${authToken}` },
        body: buildForm(),
        signal: controller.signal,
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
      })
    } finally {
      clearTimeout(timeout)
    }
  }
  let authToken = token
  for (let i = 0; i < _CV_UPLOAD_POST_MAX_ATTEMPTS; i += 1) {
    const attemptNo = i + 1
    _emitCVUploadTelemetry(token, {
      phase: "put",
      outcome: "started",
      attempt: attemptNo,
      idempotencyKey,
      fileName: file.name,
      fileMime: file.type,
      fileBytes: file.size,
    })
    let res: Response
    try {
      res = await attempt(authToken)
    } catch (err) {
      const wrapped = _wrapNetworkError(err)
      _emitCVUploadTelemetry(token, {
        phase: "put",
        outcome: "failed",
        attempt: attemptNo,
        idempotencyKey,
        reasonCode: wrapped.code,
        errorDetail: wrapped.message,
        fileName: file.name,
        fileMime: file.type,
        fileBytes: file.size,
      })
      if (attemptNo < _CV_UPLOAD_POST_MAX_ATTEMPTS) {
        _emitCVUploadTelemetry(token, {
          phase: "put",
          outcome: "retrying",
          attempt: attemptNo,
          idempotencyKey,
          reasonCode: wrapped.code,
        })
        await _sleep(_CV_UPLOAD_RETRY_BACKOFF_MS[Math.min(i, _CV_UPLOAD_RETRY_BACKOFF_MS.length - 1)])
        continue
      }
      throw wrapped
    }

    if (res.status === 401 && typeof window !== "undefined") {
      const newToken = await tryRefreshToken()
      if (newToken) {
        authToken = newToken
        _emitCVUploadTelemetry(token, {
          phase: "put",
          outcome: "retrying",
          attempt: attemptNo,
          idempotencyKey,
          reasonCode: "auth_refreshed_retry",
        })
        await _sleep(200)
        continue
      }
      forceLogout()
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }))
      const parsed = _extractUploadError(body, res.status)
      _emitCVUploadTelemetry(token, {
        phase: "put",
        outcome: "failed",
        attempt: attemptNo,
        idempotencyKey,
        reasonCode: parsed.code,
        errorDetail: parsed.message,
        httpStatus: res.status,
        fileName: file.name,
        fileMime: file.type,
        fileBytes: file.size,
      })
      if (parsed.retryable && attemptNo < _CV_UPLOAD_POST_MAX_ATTEMPTS) {
        _emitCVUploadTelemetry(token, {
          phase: "put",
          outcome: "retrying",
          attempt: attemptNo,
          idempotencyKey,
          reasonCode: parsed.code,
          httpStatus: res.status,
        })
        await _sleep(_CV_UPLOAD_RETRY_BACKOFF_MS[Math.min(i, _CV_UPLOAD_RETRY_BACKOFF_MS.length - 1)])
        continue
      }
      throw new CVUploadFailureBase(
        parsed.message,
        parsed.code,
        false,
        null,
        parsed.retryable,
        "put",
      )
    }

    _emitCVUploadTelemetry(token, {
      phase: "put",
      outcome: "succeeded",
      attempt: attemptNo,
      idempotencyKey,
      fileName: file.name,
      fileMime: file.type,
      fileBytes: file.size,
    })
    return res.json() as Promise<CVUploadResponse>
  }
  throw new CVUploadFailureBase(
    "Upload was interrupted. Tap to try again.",
    "upload_post_interrupted",
    false,
    null,
    true,
    "put",
  )
}

async function _resolveUploadResult(
  token: string,
  initial: CVUploadResponse,
  telemetry: {
    idempotencyKey?: string
    fileName?: string
    fileMime?: string
    fileBytes?: number
  } = {},
  onProgress?: (status: CVUploadStatusResponse) => void,
): Promise<CVUploadResult> {
  if (initial.status === "done") {
    _emitCVUploadTelemetry(token, {
      phase: "parse",
      outcome: "succeeded",
      idempotencyKey: telemetry.idempotencyKey ?? null,
      reasonCode: "hash_cache_hit",
      fileName: telemetry.fileName ?? null,
      fileMime: telemetry.fileMime ?? null,
      fileBytes: telemetry.fileBytes ?? null,
    })
  } else if (initial.status === "processing") {
    _emitCVUploadTelemetry(token, {
      phase: "poll",
      outcome: "started",
      jobId: initial.job_id,
      idempotencyKey: telemetry.idempotencyKey ?? null,
      fileName: telemetry.fileName ?? null,
      fileMime: telemetry.fileMime ?? null,
      fileBytes: telemetry.fileBytes ?? null,
    })
  }
  try {
    const result = await resolveCVUploadResult(initial, async (jobId) => {
      try {
        return await request<CVUploadStatusResponse>(
          `/cv/upload/status/${encodeURIComponent(jobId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
      } catch (err) {
        const wrapped = _asUploadFailure(err, "poll")
        _emitCVUploadTelemetry(token, {
          phase: "poll",
          outcome: "retrying",
          jobId,
          idempotencyKey: telemetry.idempotencyKey ?? null,
          reasonCode: wrapped.code,
          errorDetail: wrapped.message,
          fileName: telemetry.fileName ?? null,
          fileMime: telemetry.fileMime ?? null,
          fileBytes: telemetry.fileBytes ?? null,
        })
        throw wrapped
      }
    }, { onProgress })
    if (initial.status === "processing") {
      _emitCVUploadTelemetry(token, {
        phase: "poll",
        outcome: "succeeded",
        jobId: initial.job_id,
        idempotencyKey: telemetry.idempotencyKey ?? null,
        fileName: telemetry.fileName ?? null,
        fileMime: telemetry.fileMime ?? null,
        fileBytes: telemetry.fileBytes ?? null,
      })
    }
    _emitCVUploadTelemetry(token, {
      phase: "parse",
      outcome: "succeeded",
      jobId: initial.status === "processing" ? initial.job_id : null,
      idempotencyKey: telemetry.idempotencyKey ?? null,
      fileName: telemetry.fileName ?? null,
      fileMime: telemetry.fileMime ?? null,
      fileBytes: telemetry.fileBytes ?? null,
    })
    return result
  } catch (err) {
    const failure = _asUploadFailure(err, "poll")
    const phase = failure.phase ?? "poll"
    _emitCVUploadTelemetry(token, {
      phase,
      outcome: "failed",
      jobId: initial.status === "processing" ? initial.job_id : null,
      idempotencyKey: telemetry.idempotencyKey ?? null,
      reasonCode: failure.code,
      errorDetail: failure.message,
      fileName: telemetry.fileName ?? null,
      fileMime: telemetry.fileMime ?? null,
      fileBytes: telemetry.fileBytes ?? null,
    })
    throw failure
  }
}

/** Imperative status poll for callers that already have a job_id. */
export async function pollCVUploadStatus(
  token: string,
  jobId: string,
  opts: { intervalMs?: number; timeoutMs?: number; onProgress?: (status: CVUploadStatusResponse) => void } = {},
): Promise<CVUploadResult> {
  _emitCVUploadTelemetry(token, {
    phase: "poll",
    outcome: "started",
    jobId,
    idempotencyKey: readCVUploadIdempotencyKey(),
  })
  try {
    const result = await resolveCVUploadResult(
      { status: "processing", job_id: jobId },
      async (jid) => {
        try {
          return await request<CVUploadStatusResponse>(
            `/cv/upload/status/${encodeURIComponent(jid)}`,
            { headers: { Authorization: `Bearer ${token}` } },
          )
        } catch (err) {
          const failure = _asUploadFailure(err, "poll")
          _emitCVUploadTelemetry(token, {
            phase: "poll",
            outcome: "retrying",
            jobId: jid,
            idempotencyKey: readCVUploadIdempotencyKey(),
            reasonCode: failure.code,
            errorDetail: failure.message,
          })
          throw failure
        }
      },
      opts,
    )
    _emitCVUploadTelemetry(token, {
      phase: "poll",
      outcome: "succeeded",
      jobId,
      idempotencyKey: readCVUploadIdempotencyKey(),
    })
    _emitCVUploadTelemetry(token, {
      phase: "parse",
      outcome: "succeeded",
      jobId,
      idempotencyKey: readCVUploadIdempotencyKey(),
    })
    return result
  } catch (err) {
    const failure = _asUploadFailure(err, "poll")
    _emitCVUploadTelemetry(token, {
      phase: failure.phase ?? "poll",
      outcome: "failed",
      jobId,
      idempotencyKey: readCVUploadIdempotencyKey(),
      reasonCode: failure.code,
      errorDetail: failure.message,
    })
    throw failure
  }
}

// ── Scores ────────────────────────────────────────────────────────────────────

export interface GapSkill {
  skill: string
  current_level: number
  target_level: number
  gap_score: number
  job_count_30d: number
  why_it_matters: string
  /** Honest projected Myro Score gain from practising +1 level (T2-3). 0 pre-recompute. */
  score_delta?: number
  /** Scoring domain code (SD/DE/…) this gap rolls up to — groups levers under their domain row. */
  domain?: string
}

export interface ScoreResponse {
  total_score: number
  domain_scores: Record<string, number>
  gap_skills: GapSkill[]
  skills_assessed: number
  computed_at: string
  /** Seniority band the score is measured against (entry/mid/senior/…). */
  band?: string
  /** Percentile RANK within the band (0–100, higher = better). Null until ranked. */
  band_percentile?: number | null
  /** Presentation of the rank: "top {top_percent}% for {band}". Null until ranked. */
  top_percent?: number | null
}

export interface ScoreMapResponse {
  score: ScoreResponse
  skills: UserSkillsByDomain
}

interface ComputeScoreApiResponse {
  score: ScoreResponse
  skills_updated: number
}

export const scores = {
  compute: (token: string) =>
    request<ComputeScoreApiResponse>("/scores/compute", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).then((res) => res.score),
  me: (token: string) =>
    request<ScoreResponse>("/scores/me", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  map: (token: string) =>
    request<ScoreMapResponse>("/scores/map", {
      headers: { Authorization: `Bearer ${token}` },
    }),
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

export interface JobMatch {
  id: number
  job_id: string
  title: string
  company: string | null
  location: string | null
  location_city?: string | null
  location_country?: string | null
  location_mode?: "onsite" | "hybrid" | "remote" | "unknown" | null
  location_quality?: "ok" | "unknown" | null
  locations?: string[]
  industry?: string | null
  remote: boolean
  overlap_score: number
  // Match Verdict — the single "how good / what to do" decision, computed server-side
  // (see backend CONTEXT.md "Match Verdict"). Surfaces read THESE, never re-derive.
  match_score: number // 0–100 — THE fit number (brain-spined, overlap-gated)
  verdict: "strong" | "worth_it" | "stretch" | "checking"
  is_strong: boolean // was the frontend isCredibleRecommendation
  llm_rank: number | null
  llm_explanation: string | null
  batch_week: string
  source_url: string | null
  matched_skills: string[]
  missing_skills?: string[] // required skills the user lacks — powers ✗ gap chips (T3-1)
  job_summary?: string | null // LLM-enriched ≤100-word clean prose — card body, preferred over job_description
  /** Bounded snippet (600 chars), NOT the full JD — it averaged 3,734 chars and
   *  was ~60% of the /jobs/matches payload. Card snippets (200) and mobile (260)
   *  truncate below this anyway. When `job_description_truncated` is true, fetch
   *  the rest with `jobs.jobDescription(token, jobId)`. */
  job_description?: string | null
  job_description_truncated?: boolean
  // Scraper structured chip columns (backlog #22) — null when a provider omits them
  date_posted?: string | null
  seniority_level?: string | null
  work_mode?: string | null
  min_years_experience?: number | null
  max_years_experience?: number | null
  // Matching Brain (Career Ops 5-axis eval) — null until the LLM stage runs
  overall_score?: number | null // 0.0–5.0
  grade?: string | null // A+|A|A-|B+|B|B-|C+|C|C-|D|F
  recommendation?: "Apply" | "Negotiate" | "Skip" | string | null
  application_angle?: string | null
  summary?: string | null
  role_fit?: number | null // 0.0–5.0
  comp_fit?: number | null
  growth_fit?: number | null
  culture_fit?: number | null
  risk_score?: number | null // HIGHER = riskier
  strengths?: string[]
  concerns?: string[]
  archetype?: string | null                                        // Block A — role archetype
  legitimacy_tier?: "high_confidence" | "caution" | "suspicious" | string | null // Block G
  legitimacy_reason?: string | null
  // Scraper lifecycle (Job Intelligence) — now carried on /jobs/matches.
  // `last_seen_at` = scraper observation time, powers "Last verified".
  // `first_seen` = discovery age / sort only. Never the publication clock.
  first_seen?: string | null
  last_seen_at?: string | null
  is_stale?: boolean
  is_active?: boolean
  is_recommended?: boolean
  baseline_version_id?: number | null
  target_context_hash?: string | null
  seniority_compatibility?: string | null // "compatible" | "incompatible" | "unknown"
}

export interface JobMatchesResponse {
  jobs: JobMatch[]
  batch_week: string
  total: number
  feed_updated_at: string | null
  matches_computed_at: string | null
  new_jobs_count: number
  dismissed_job_ids: string[]
  /** Career-Ops vetting health: vetted | overlap_only | computing | failed | empty.
   *  overlap_only/failed drive the honest "not AI-vetted — retry (free)" banner. */
  match_health: MatchHealth
  match_vetted_count: number
}

export type MatchHealth = "vetted" | "overlap_only" | "computing" | "failed" | "empty"

export interface MatchRetryResponse {
  accepted: boolean
  match_health: MatchHealth
}

/* ─── Job Intelligence (Feed State · Feedback · Pulse) ───────────────────── */

export interface FeedState {
  feed_version: string | null
  published_at: string | null
  imported_job_count: number
  latest_batch_date: string | null
}

/** Result of a conditional Feed State read — unchanged (304) vs fresh (200). */
export type FeedStateResult =
  | { status: "unchanged"; etag: string | null }
  | { status: "fresh"; etag: string | null; data: FeedState }

export type PersonalReasonCode =
  | "not_my_role"
  | "location"
  | "seniority"
  | "compensation"
  | "company"
  | "skills_gap"
  | "already_applied"

export type QualityReasonCode =
  | "looks_old"
  | "apply_link_closed"
  | "apply_link_live"
  | "apply_redirected"
  | "apply_wrong_role"
  | "apply_technical_error"
  | "duplicate"
  | "details_wrong"
  | "posting_inactive"

export type FeedbackSurface = "dashboard" | "market" | "job_detail" | "other"

export type ApplyIntentSurface =
  | "dashboard"
  | "market"
  | "collections"
  | "cv_playground"
  | "cv_export"
  | "mobile_jobs"
  | "mobile_collections"
  | "agent_pick"
  | "other"

export interface ApplyIntentInput {
  client_event_id: string
  surface: ApplyIntentSurface
  destination_type: "direct_role" | "career_search"
}

/** Whether a listing still exists. `unknown` is a real answer — an ATS that
 *  blocks or times out our check is no evidence the role is gone, so the
 *  surface says "couldn't check" rather than implying either verdict. */
export interface JobLiveness {
  job_id: string
  state: "live" | "closed" | "unverified" | "unknown"
  checked_at: string | null
  verified_live_at: string | null
  from_cache: boolean
}

export interface JobFeedbackInput {
  client_event_id: string
  job_id: string
  feedback_kind: "personal" | "quality"
  reason_code: PersonalReasonCode | QualityReasonCode
  surface: FeedbackSurface
}

export interface JobFeedbackReceipt {
  event_id: number
  client_event_id: string
  job_id: string
  feedback_kind: "personal" | "quality"
  reason_code: string
  surface: string
  created_at: string
  /** false = idempotent replay of an event with the same client_event_id. */
  created: boolean
}

export type ListingConfidence = "active" | "uncertain" | "likely_closed" | "closed"
export type ResponseSignal = "low" | "mixed" | "high"

export interface JobPulse {
  job_id: string
  first_seen_at: string | null
  last_verified_at: string | null
  is_stale: boolean
  listing_confidence: ListingConfidence
  /** null community counts = privacy cohort < 5 contributors. NEVER render as 0. */
  tracking_count: number | null
  outcomes_shared: number | null
  ghosted_count: number | null
  response_signal: ResponseSignal | null
  quality_report_count: number | null
}

export type RefreshLifecycle = "queued" | "computing" | "done" | "failed"
export type RefreshOutcomeKind = "written" | "cache_hit" | "exhausted" | "needs_onboarding"

export interface RefreshTicketResponse {
  id: string
  state: "queued" | "computing" | "done"
  progress_label: string
  batch_week: string
  xp_charged: number
  /** null when the run was free — no charge, so no new balance. Keep yours. */
  new_coin_balance: number | null
  matches_written: number | null
}

export interface RefreshPreflightResponse {
  role_titles: string[]
  location: string | null
  deal_breakers: string[]
  career_goal: string | null
  superpower: string | null
  /** field name → "memory" for every field gap-filled from user_memory */
  prefilled: Record<string, string>
  memory_count: number
  /** Coins this run will cost, decided server-side — 0 when Myro landed roles
   *  this user has never been matched against. Never price from a constant. */
  run_cost: number
  /** Roles that landed since their last search — the reason it's free. */
  new_jobs_count: number
}

export interface RefreshStateResponse {
  ticket_id: string
  state: RefreshLifecycle
  progress_label: string
  batch_week: string
  matches_written: number | null
  refund: number | null
  new_coin_balance: number | null
  outcome_kind: RefreshOutcomeKind | null
  error: string | null
  debug: Record<string, unknown> | null
}

export type ApplicationStatus =
  | "saved"
  | "applied"
  | "interviewing"
  | "ghosted"
  | "rejected"
  | "offer"

export const APPLICATION_STAGES: ApplicationStatus[] = ["saved", "applied", "interviewing"]
export const APPLICATION_OUTCOMES: ApplicationStatus[] = ["ghosted", "rejected", "offer"]

export interface ApplicationReview {
  id: string
  job_application_id: number
  company_name: string
  star_rating: number
  last_stage: string
  outcome: string
  written_note: string | null
  created_at: string
}

export interface StaleApplication {
  id: number
  job_id: string
  title: string
  company: string | null
  status: ApplicationStatus
  updated_at: string | null
}

export interface CompanyReviewItem {
  star_rating: number
  last_stage: string
  outcome: string
  written_note: string | null
  created_at: string
}

export interface CompanyPage {
  company_name: string
  avg_star_rating: number | null
  review_count: number
  ghost_rate: number | null
  stage_breakdown: Record<string, number>
  reviews: CompanyReviewItem[]
}

export interface CompanyJobCard {
  job_id: string
  title: string
  location: string | null
  location_city: string | null
  location_country: string | null
  location_mode: string | null
  primary_skills: string[]
}

export interface CompanyJobsResponse {
  company_name: string
  total: number
  jobs: CompanyJobCard[]
  page: number
  page_size: number
  has_next: boolean
}

export interface CompanySkillProfile {
  skill_id: number
  display_name: string
  taxonomy_key: string
  domain: string
  current_job_count: number
  peak_job_count: number
  observation_run_count: number
  avg_required_level: number | null
  trend_signal: "emerging" | "steady" | "declining" | "dormant"
  first_seen_at: string
  last_seen_at: string
}

export interface CompanySkillIntelligence {
  company_id: number
  company_name: string
  slug: string
  as_of: string | null
  source_run_id: string | null
  skills: CompanySkillProfile[]
  newsletter_summary: {
    top_skills: string[]
    emerging_skills: string[]
    declining_skills: string[]
    dormant_skills: string[]
  }
}

export interface CVBadge {
  version_id: number
  version_number: number
  kind: CVVersionKind
  polished: boolean
}

export interface ApplicationResponse {
  id: number
  job_id: string
  title: string
  company: string | null
  job_description?: string | null
  status: ApplicationStatus
  source: string
  applied_at: string | null
  response_at: string | null
  checkin_sent_at: string | null
  followed_up_at?: string | null
  closed_at?: string | null
  offer_received_at?: string | null
  notes: string | null
  created_at: string
  last_stage_changed_at?: string | null
  collection_snoozed_until?: string | null
  collection_attention_level?: "review" | "decide" | "urgent" | null
  /** Deliberate apply/preparation intent. Priority jobs lead Collections. */
  is_priority?: boolean
  priority_marked_at?: string | null
  /** Persisted Career Ops fit for this saved role, when it has been ranked. */
  match_score?: number | null
  is_first_offer?: boolean
  cv_badge?: CVBadge | null
  coins_earned?: number | null
  coin_balance?: number | null
  // First-class card data (list endpoint) — a tracked job renders the full
  // FeedCard via synthMatch, not an empty body.
  skills?: string[]
  matched_skills?: string[]
  missing_skills?: string[]
  location?: string | null
  location_city?: string | null
  location_country?: string | null
  location_mode?: "onsite" | "hybrid" | "remote" | "unknown" | null
  locations?: string[]
  job_summary?: string | null
  source_url?: string | null
  date_posted?: string | null
  seniority_level?: string | null
  work_mode?: string | null
  /** Corpus role bucket — the "more roles like this one" scope. */
  role_domain?: string | null
  min_years_experience?: number | null
  max_years_experience?: number | null
}

export interface JobFileExtract {
  company: string
  role: string
  location: string
  job_description: string
}

export interface JobPathTarget {
  skill: string
  is_primary: boolean
  selected_at?: string | null
  proof_count: number
}

export interface JobPathMilestone {
  id: string
  milestone_date: string
  skill: string
  is_primary: boolean
  template_id?: string | null
  title: string
  action: string
  proof_prompt?: string | null
  impact_prompt?: string | null
  proof?: string | null
  impact?: string | null
  confidence?: number | null
  completed_at?: string | null
}

export interface JobPathCVSummary {
  id?: number | null
  confidence: Record<string, string | number | boolean>
  snapshot_hash?: string | null
  ai_polished: boolean
  created_at?: string | null
}

export interface JobPathResponse {
  job_id: string
  job_title: string
  company: string | null
  readiness_pct: number
  readiness_tier: Record<string, unknown>
  target_skills: JobPathTarget[]
  milestones: JobPathMilestone[]
  today_milestone: JobPathMilestone | null
  cv: JobPathCVSummary | null
  follow_up: Record<string, unknown> | null
  status: ApplicationStatus
  applied_at: string | null
}


export interface NameCountItem {
  name: string
  count: number
  last_seen_at?: string | null
  velocity_bins?: number[] | null
  country?: string | null
  industry?: string | null
}

export interface SkillCountItem {
  skill: string
  count: number
}

export interface JobSearchItem {
  job_id: string
  job_title: string
  company_name: string | null
  job_description: string | null
  location?: string | null
  location_city?: string | null
  location_country?: string | null
  location_mode?: "onsite" | "hybrid" | "remote" | "unknown" | null
  location_quality?: "ok" | "unknown" | null
}

export interface JobSearchResponse {
  jobs: JobSearchItem[]
  available_total: number
  returned_total: number
  page: number
  page_size: number
  has_next_page: boolean
}

// "fit" = the composite Best-fit rank (market filter rework). "fresh" = Newest.
// personal/company/role are legacy modes the UI no longer sends (cleanup-debt,
// CLAUDE.md OPEN BACKLOG #23) — kept so the API stays back-compatible.
export type JobFeedSort = "fit" | "fresh"

export type CareerBand = "engineering_data" | "business_product_operations" | "research_people_public_impact" | "design_creative"

export interface JobFeedItem {
  job_id: string
  job_title: string
  company_name: string | null
  job_description: string | null
  location?: string | null
  location_city?: string | null
  location_country?: string | null
  location_mode?: "onsite" | "hybrid" | "remote" | "unknown" | null
  location_quality?: "ok" | "unknown" | null
  locations?: string[]
  role_domain?: string | null
  career_band?: CareerBand | null
  seniority_level?: string | null
  min_years_experience?: number | null
  max_years_experience?: number | null
  industry?: string | null
  source_url?: string | null
  first_seen?: string | null
  last_seen_at?: string | null  // ISO date the scraper last confirmed it live
  is_stale?: boolean            // unseen >21d — warn before the Apply link 404s
  is_active: boolean
  skills: string[]
  matched_skills?: string[]  // which of `skills` the user's CV covers — ✓/✗ chip marking (T3-1)
  matched_skill_count: number
  target_role_match: number  // how many of the user's target roles this job covers
  // Matching-Brain badges from the cached eval (Consolidation D). Present only when
  // the brain already ran on this job for this user; absent = deterministic overlap.
  overall_score?: number | null
  grade?: string | null
  recommendation?: "Apply" | "Negotiate" | "Skip" | string | null
  legitimacy_tier?: "high_confidence" | "caution" | "suspicious" | string | null
  legitimacy_reason?: string | null
  archetype?: string | null
  // Match Verdict (server-derived, never in the client). Present only on cards the
  // brain has ranked; absent = an un-warmed browse row below the picks divider.
  match_score?: number | null
  verdict?: "strong" | "worth_it" | "stretch" | "checking" | null
  is_strong?: boolean
}

/** One card in the "Myro Agent Picks" band — a feed card plus the Career-Ops
 *  brain's rank + why-it-fits note (the curated editorial layer above the
 *  algorithm feed). GET /jobs/agent-picks. */
export interface AgentPickItem extends JobFeedItem {
  agent_rank: number
  agent_tier?: "bullseye" | "strong" | "reach" | string | null
  agent_comment: string
}

export interface AgentPicksResponse {
  picks: AgentPickItem[]
  total: number
}

/** On-demand single-job brain eval (Consolidation D) → POST /jobs/{id}/brain. */
export interface MatchBrainResult {
  job_id: string
  cached: boolean
  available: boolean
  overall_score?: number | null
  grade?: string | null
  recommendation?: "Apply" | "Negotiate" | "Skip" | string | null
  summary?: string | null
  application_angle?: string | null
  role_fit?: number | null
  comp_fit?: number | null
  growth_fit?: number | null
  culture_fit?: number | null
  risk_score?: number | null
  strengths?: string[]
  concerns?: string[]
  archetype?: string | null
  legitimacy_tier?: "high_confidence" | "caution" | "suspicious" | string | null
  legitimacy_reason?: string | null
}

export interface JobFeedResponse {
  jobs: JobFeedItem[]
  available_total: number
  returned_total: number
  page: number
  page_size: number
  has_next_page: boolean
  sort: JobFeedSort
  expansion_tier: "exact" | "remote_country" | "country"
  expansion_label: string | null
  // How many leading cards the brain has ranked (carry a verdict). The feed draws
  // its "more roles" divider after this many; 0 = no ranked shortlist.
  ranked_count: number
}

/** POST /jobs/feed/warm — the brain ranked the feed's top shortlist. */
export interface FeedWarmResponse {
  ready: boolean
  warmed: number
}

export interface HiddenJobItem {
  job_id: string
  job_title: string
  company_name: string | null
  location: string | null
  dismissed_at: string | null
}

export interface JobFeedParams {
  cluster?: string | null
  roleDomain?: string | null
  q?: string | null
  /** Skill facet — the canonical skill name; filters the feed by job_skills
   *  membership, distinct from the free-text `q`. */
  skill?: string | null
  locationCity?: string | null
  locationCountry?: string | null
  locationMode?: "onsite" | "hybrid" | "remote" | "unknown" | null
  sort?: JobFeedSort
  minSkillMatches?: number
  followingOnly?: boolean
  includeStretch?: boolean
  page?: number
  pageSize?: number
  browseScope?: "exact" | "remote_country" | "country"
}

export interface MarketAnalytics {
  total_jobs: number
  total_companies: number
  total_industries: number
  latest_batch?: string | null
  scraper_started?: string | null
  total_jobs_today?: number
  jobs_added_1h?: number
  companies_added_7d?: number
  by_company: NameCountItem[]
  by_industry: NameCountItem[]
  by_role: NameCountItem[]
  by_location_city: NameCountItem[]
  by_location_country: NameCountItem[]
  by_location_mode: NameCountItem[]
  /** Market-wide top skills by active-job count — universal, same for every
   *  user. Powers the /market rail's "Skill-demand movers". */
  top_skills: SkillCountItem[]
}

export interface EntitySkillsData {
  entity: string
  type: string
  skills: SkillCountItem[]
}

export interface SkillHeatmapData {
  matrix: Record<string, Record<string, number>>
}

export type SkillDemandWindow = "30d" | "all"

/** One skill a city is hiring for. `companies` is not decoration: a role count
 *  alone cannot tell a broad market from one employer's bulk posting. */
export interface SkillDemandItem {
  skill: string
  roles: number
  companies: number
}

export interface SkillDemand {
  city: string
  window: SkillDemandWindow
  skills: SkillDemandItem[]
  /** When the snapshot was computed — shown, so a stale corpus reads as stale. */
  computed_at?: string | null
}

export interface SkillDemandCityItem {
  city: string
  live_roles: number
}

export interface SkillDemandCities {
  cities: SkillDemandCityItem[]
  computed_at?: string | null
}

/** Company demand pulse (Signal Thread S2). pulse === null = live but no signal. */
export interface CompanyPulseItem {
  company_name: string
  open_roles: number
  weekly_delta: number
  pulse: number | null
  series: number[]
  last_seen_at?: string | null
}

export interface CompanyPulseResponse {
  companies: CompanyPulseItem[]
}

/** Company with an indexable detail page (>=1 live listing) — sitemap allowlist. */
export interface IndexableCompanyItem {
  name: string
  active_count: number
}
export interface IndexableCompaniesResponse {
  companies: IndexableCompanyItem[]
}

/** New-this-week (company × skill) role count — the gap-alert signal (S3). */
export interface CompanyGapSignalItem {
  company_name: string
  skill: string
  new_roles: number
}

export interface CompanyGapSignalsResponse {
  signals: CompanyGapSignalItem[]
}

export interface JobLocationFilters {
  locationCity?: string | null
  locationCountry?: string | null
  locationMode?: "onsite" | "hybrid" | "remote" | "unknown" | null
}

export interface SkillGapItem {
  skill: string
  is_primary: boolean
  user_level: number
  required_level: number
  missing: boolean
}

export interface SkillGapResponse {
  job_id: string
  job_title: string
  company: string | null
  skills: SkillGapItem[]
  gap_pct: number
  total_required: number
  missing_count: number
}

/** A purchased deepener answer (Q8 XP-gated follow-up). */
export interface DeepeningItem {
  prompt_key: string
  answer: string
}

/** One reach search — opened in the user's own browser (ADR-0018). */
export interface ReachSearchItem {
  label: string
  url: string
  kind: "linkedin" | "google"
}

export interface ReachSearchResponse {
  reporting_target: string | null
  function: string
  target_titles: string[]
  primary: ReachSearchItem | null
  alternates: ReachSearchItem[]
}

export interface ReachPack {
  outreach_message: string
  referral_ask: string
  timing: string
  warm_intro: string
}

export interface ReachPackResponse {
  purchased: boolean
  pack: ReachPack | null
  cost: number
  new_coin_balance: number | null
}

// Preparations room day-of brief (30 coins, charge-on-success, replay free).
export interface PrepBriefLead {
  story: string
  why: string
}

export interface PrepBrief {
  snapshot: string
  leads: PrepBriefLead[]
  likely_questions: string[]
  watch_out: string
  plan: string[]
}

export interface PrepBriefResponse {
  purchased: boolean
  brief: PrepBrief | null
  cost: number
  new_coin_balance: number | null
}

export interface UserSkillDemandItem {
  skill: string
  display_name: string
  current_level: number
  proficiency_title: string
  target_level: number | null
  needs_upgrade: boolean
  job_count_30d: number
  weighted_demand: number
  demand_band?: DemandBand
  /** Active jobs needing this skill in the user's location scope. Present only
   *  on location-scoped demand reads (the market rail); null otherwise. */
  scoped_job_count?: number | null
}

export type DemandBand = "very_high" | "high" | "moderate" | "low" | "none"

export interface UserSkillDemandResponse {
  skills: UserSkillDemandItem[]
  total: number
}

export interface CompanyOpenRoleItem {
  job_id: string
  job_title: string
  location_city?: string | null
  location_country?: string | null
  location_mode?: string | null
  created_at?: string | null
}
export interface CompanyOpenRolesResponse {
  company: string
  jobs: CompanyOpenRoleItem[]
}

export interface CompanyHiringItem {
  company_name: string
  open_count: number
  location_country?: string | null
  last_seen_at?: string | null
}
export interface TopCompaniesAtResponse {
  kind: "industry" | "city"
  value: string
  companies: CompanyHiringItem[]
}
export type TopCompaniesSort = "roles" | "last_seen"

export interface GlobalJobHit {
  job_id: string
  job_title: string
  company_name?: string | null
  location_city?: string | null
  location_country?: string | null
  location_mode?: string | null
  created_at?: string | null
}
export interface GlobalJobSearchResponse {
  query: string
  hits: GlobalJobHit[]
}

// Deterministic fit % for a batch of jobs against the caller's CV skills —
// powers the logged-in /intel drill. Same `_compute_overlap` the analyse path
// uses, so the number matches the dashboard. No charge, no LLM, no persist.
export interface JobFitItem {
  job_id: string
  overlap_score: number
  matched_skills: string[]
  matched_count: number
  total_skills: number
}
export interface JobFitBatchResponse {
  fits: JobFitItem[]
}

export interface IntentChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface IntentFilterDiff {
  add_roles: string[]
  remove_roles: string[]
  locations: string[]
  seniority: string | null
  work_mode: string | null
  salary: string | null
}

export interface IntentChatResponse {
  reply: string
  proposed_diff: IntentFilterDiff | null
}

export const jobs = {
  companySkillIntelligence: (company: string, limit = 20) =>
    request<CompanySkillIntelligence>(
      `/companies/${encodeURIComponent(company)}/skill-intelligence?limit=${limit}`,
    ),

  searchCompanies: (q: string, limit = 10) =>
    request<string[]>(`/jobs/companies/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  listAtCompany: (company: string, limit = 6, locationCountry?: string | null) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (locationCountry && locationCountry.trim()) {
      params.set("location_country", locationCountry.trim())
    }
    return request<CompanyOpenRolesResponse>(
      `/jobs/at/${encodeURIComponent(company)}?${params.toString()}`,
    )
  },

  topCompaniesAt: (group: { kind: "industry" | "city"; name: string }, limit = 8, sortBy: TopCompaniesSort = "roles") => {
    const params = new URLSearchParams({ limit: String(limit) })
    params.set(group.kind, group.name)
    params.set("sort_by", sortBy)
    return request<TopCompaniesAtResponse>(`/jobs/companies-at?${params.toString()}`)
  },

  fitBatch: (token: string, jobIds: string[]) =>
    request<JobFitBatchResponse>("/jobs/fit-batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ job_ids: jobIds }),
    }),

  globalSearch: (q: string, limit = 12) =>
    request<GlobalJobSearchResponse>(
      `/jobs/search/global?q=${encodeURIComponent(q)}&limit=${limit}`,
    ),

  analytics: (
    roleDomain?: string | null,
    locationFilters?: JobLocationFilters,
  ) => {
    const params = new URLSearchParams()
    if (roleDomain && roleDomain.trim()) {
      params.set("role_domain", roleDomain.trim())
    }
    if (locationFilters?.locationCity && locationFilters.locationCity.trim()) {
      params.set("location_city", locationFilters.locationCity.trim())
    }
    if (locationFilters?.locationCountry && locationFilters.locationCountry.trim()) {
      params.set("location_country", locationFilters.locationCountry.trim())
    }
    if (locationFilters?.locationMode && locationFilters.locationMode.trim()) {
      params.set("location_mode", locationFilters.locationMode.trim())
    }
    const query = params.toString()
    return request<MarketAnalytics>(`/jobs/analytics${query ? `?${query}` : ""}`)
  },
  analyticsForMe: (
    token: string,
    cluster?: string | null,
    locationFilters?: JobLocationFilters,
  ) => {
    const params = new URLSearchParams()
    if (cluster && cluster.trim()) params.set("cluster", cluster.trim())
    if (locationFilters?.locationCity && locationFilters.locationCity.trim()) {
      params.set("location_city", locationFilters.locationCity.trim())
    }
    if (locationFilters?.locationCountry && locationFilters.locationCountry.trim()) {
      params.set("location_country", locationFilters.locationCountry.trim())
    }
    if (locationFilters?.locationMode && locationFilters.locationMode.trim()) {
      params.set("location_mode", locationFilters.locationMode.trim())
    }
    const query = params.toString()
    return request<MarketAnalytics>(`/jobs/analytics/me${query ? `?${query}` : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  },
  skillDemandCities: () => request<SkillDemandCities>("/jobs/skill-demand/cities"),
  skillDemand: (city: string, window: SkillDemandWindow = "30d", limit = 8) => {
    const params = new URLSearchParams({ city, window, limit: String(limit) })
    return request<SkillDemand>(`/jobs/skill-demand?${params.toString()}`)
  },
  skillHeatmap: (companies: string[], skills: string[]) => {
    const params = new URLSearchParams({
      companies: companies.join(","),
      skills: skills.join(","),
    })
    return request<SkillHeatmapData>(`/jobs/analytics/skill-heatmap?${params.toString()}`)
  },
  companyPulse: (companies: string[]) => {
    const params = new URLSearchParams({ companies: companies.join(",") })
    return request<CompanyPulseResponse>(`/jobs/companies/pulse?${params.toString()}`)
  },
  // SEO-indexing allowlist: companies whose detail page has real content
  // (>=1 live listing). The sitemap emits only these (Fix 1, GSC report
  // 2026-07-23) so Google isn't sent thin/empty company pages.
  indexableCompanies: () =>
    request<IndexableCompaniesResponse>(`/jobs/companies/indexable`),
  companyGapSignals: (companies: string[], skills: string[]) => {
    const params = new URLSearchParams({ companies: companies.join(","), skills: skills.join(",") })
    return request<CompanyGapSignalsResponse>(`/jobs/companies/gap-signals?${params.toString()}`)
  },
  analyticsEntitySkills: (
    entity: string,
    type: "company" | "industry",
    locationFilters?: JobLocationFilters,
  ) => {
    const params = new URLSearchParams({ entity, type })
    if (locationFilters?.locationCity?.trim()) params.set("location_city", locationFilters.locationCity.trim())
    if (locationFilters?.locationCountry?.trim()) params.set("location_country", locationFilters.locationCountry.trim())
    if (locationFilters?.locationMode?.trim()) params.set("location_mode", locationFilters.locationMode.trim())
    return request<EntitySkillsData>(`/jobs/analytics/skills?${params.toString()}`)
  },
  search: (
    company: string,
    options?: {
      roleDomain?: string | null
      skill?: string | null
      locationCity?: string | null
      locationCountry?: string | null
      locationMode?: "onsite" | "hybrid" | "remote" | "unknown" | null
      page?: number | null
      pageSize?: number | null
    },
  ) => {
    const normalizedCompany = company.trim()
    if (!normalizedCompany) {
      throw new Error("company is required")
    }
    const params = new URLSearchParams()
    params.set("company", normalizedCompany)
    if (options?.roleDomain && options.roleDomain.trim()) {
      params.set("role_domain", options.roleDomain.trim())
    }
    if (options?.skill && options.skill.trim()) {
      params.set("skill", options.skill.trim())
    }
    if (options?.locationCity && options.locationCity.trim()) {
      params.set("location_city", options.locationCity.trim())
    }
    if (options?.locationCountry && options.locationCountry.trim()) {
      params.set("location_country", options.locationCountry.trim())
    }
    if (options?.locationMode && options.locationMode.trim()) {
      params.set("location_mode", options.locationMode.trim())
    }
    if (options?.page && options.page > 0) {
      params.set("page", String(options.page))
    }
    if (options?.pageSize && options.pageSize > 0) {
      params.set("page_size", String(options.pageSize))
    }
    return request<JobSearchResponse>(`/jobs/search?${params.toString()}`)
  },
  feed: (token: string, p: JobFeedParams = {}) => {
    const params = new URLSearchParams()
    if (p.cluster && p.cluster.trim()) params.set("cluster", p.cluster.trim())
    if (p.roleDomain && p.roleDomain.trim()) params.set("role_domain", p.roleDomain.trim())
    if (p.q && p.q.trim()) params.set("q", p.q.trim())
    if (p.skill && p.skill.trim()) params.set("skill", p.skill.trim())
    if (p.locationCity && p.locationCity.trim()) params.set("location_city", p.locationCity.trim())
    if (p.locationCountry && p.locationCountry.trim()) params.set("location_country", p.locationCountry.trim())
    if (p.locationMode && p.locationMode.trim()) params.set("location_mode", p.locationMode.trim())
    if (p.sort) params.set("sort", p.sort)
    if (p.minSkillMatches && p.minSkillMatches > 0) params.set("min_skill_matches", String(p.minSkillMatches))
    if (p.followingOnly) params.set("following_only", "true")
    if (p.includeStretch) params.set("include_stretch", "true")
    if (p.page && p.page > 0) params.set("page", String(p.page))
    if (p.pageSize && p.pageSize > 0) params.set("page_size", String(p.pageSize))
    if (p.browseScope) params.set("browse_scope", p.browseScope)
    const qs = params.toString()
    return request<JobFeedResponse>(`/jobs/feed${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  },
  /** Rank the top of the feed with the career-ops brain, then re-read /jobs/feed.
   *  Scope params must match the feed's so the warmed cards are the ones shown.
   *  Soft-resolves on any failure/timeout to {ready:false} — the feed then paints
   *  the deterministic order (degradation, never a blocked page). */
  warmFeed: async (token: string, p: JobFeedParams = {}): Promise<FeedWarmResponse> => {
    const params = new URLSearchParams()
    if (p.cluster && p.cluster.trim()) params.set("cluster", p.cluster.trim())
    if (p.roleDomain && p.roleDomain.trim()) params.set("role_domain", p.roleDomain.trim())
    if (p.q && p.q.trim()) params.set("q", p.q.trim())
    if (p.skill && p.skill.trim()) params.set("skill", p.skill.trim())
    if (p.locationCity && p.locationCity.trim()) params.set("location_city", p.locationCity.trim())
    if (p.locationCountry && p.locationCountry.trim()) params.set("location_country", p.locationCountry.trim())
    if (p.locationMode && p.locationMode.trim()) params.set("location_mode", p.locationMode.trim())
    if (p.followingOnly) params.set("following_only", "true")
    if (p.includeStretch) params.set("include_stretch", "true")
    if (p.browseScope) params.set("browse_scope", p.browseScope)
    const qs = params.toString()
    try {
      return await request<FeedWarmResponse>(`/jobs/feed/warm${qs ? `?${qs}` : ""}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: 7000,
      })
    } catch {
      return { ready: false, warmed: 0 }
    }
  },
  /** The curated "Myro Agent Picks" band — the brain's hand-vetted shortlist that
   *  sits above the algorithm feed. Empty list for users with no picks. */
  agentPicks: (token: string) =>
    request<AgentPicksResponse>(`/jobs/agent-picks`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  skipJob: (token: string, jobId: string) =>
    request<void>(`/jobs/feed/${encodeURIComponent(jobId)}/skip`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  unskipJob: (token: string, jobId: string) =>
    request<void>(`/jobs/feed/${encodeURIComponent(jobId)}/skip`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
  hiddenJobs: (token: string) =>
    request<HiddenJobItem[]>("/jobs/feed/hidden", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  mySkillDemand: (token: string, opts?: { locationScoped?: boolean }) =>
    request<UserSkillDemandResponse>(
      `/jobs/my-skills/demand${opts?.locationScoped ? "?location_scoped=true" : ""}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    ),
  matches: (token: string) =>
    request<JobMatchesResponse>("/jobs/matches", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  dismissMatchCard: (token: string, jobId: string) =>
    request<void>(`/jobs/matches/${encodeURIComponent(jobId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** FREE re-vet after a failed / un-vetted match run (NOT the paid refresh).
   *  Server gates it on match_health being failed/overlap_only. */
  retryMatches: (token: string) =>
    request<MatchRetryResponse>("/jobs/matches/retry", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** On-demand Matching-Brain for one job (Consolidation D). Idempotent + cached:
   *  first open/save computes it, later reads are free. Fire on drawer open. */
  ensureBrain: (token: string, jobId: string) =>
    request<MatchBrainResult>(`/jobs/${encodeURIComponent(jobId)}/brain`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** Conditional Feed State read. Pass the last ETag; a match returns "unchanged". */
  feedState: async (token: string, etag: string | null): Promise<FeedStateResult> => {
    const r = await requestConditional("/jobs/feed-state", token, etag)
    if (r.status === 304) return { status: "unchanged", etag: r.etag }
    return { status: "fresh", etag: r.etag, data: r.json as FeedState }
  },
  /** Structured feedback. Idempotent on client_event_id; can throw 429 on the quality cap. */
  submitFeedback: (token: string, input: JobFeedbackInput) =>
    request<JobFeedbackReceipt>("/jobs/feedback", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    }),
  /** Batched Job Pulse. Caller must pass 1-100 unique, nonblank IDs; order is preserved. */
  pulses: (token: string, jobIds: string[]) =>
    request<{ pulses: JobPulse[] }>("/jobs/pulses", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ job_ids: jobIds }),
    }),
  refresh: (token: string) =>
    request<RefreshTicketResponse>("/jobs/refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** Targeting Brief manifest for the pre-flight modal — profile fields
   *  gap-filled from user_memory (see `prefilled` provenance). */
  refreshPreflight: (token: string) =>
    request<RefreshPreflightResponse>("/jobs/refresh/preflight", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  refreshStatus: (token: string, ticketId: string) =>
    request<RefreshStateResponse>(`/jobs/refresh/${encodeURIComponent(ticketId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  applications: (token: string) =>
    request<ApplicationResponse[]>("/jobs/applications", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  contributions: (token: string) =>
    request<JobProvenance>("/jobs/contributions", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  recordApplyIntent: (token: string, jobId: string, input: ApplyIntentInput) =>
    request<void>(`/jobs/${encodeURIComponent(jobId)}/apply-intents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    }),
  /** Is this listing still live? Verified on demand when the last verdict is
   *  stale, so a ghost is caught before the user spends effort on it. */
  liveness: (token: string, jobId: string) =>
    request<JobLiveness>(`/jobs/${encodeURIComponent(jobId)}/liveness`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  staleApplications: (token: string) =>
    request<StaleApplication[]>("/jobs/applications/stale", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  submitReview: (
    token: string,
    jobId: string,
    data: { star_rating: number; last_stage: string; written_note?: string | null },
  ) =>
    request<ApplicationReview>(`/jobs/applications/${encodeURIComponent(jobId)}/review`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    }),
  saveJob: (token: string, jobId: string) =>
    request<ApplicationResponse>(`/jobs/save/${encodeURIComponent(jobId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  setJobPriority: (token: string, jobId: string, prioritized: boolean) =>
    request<ApplicationResponse>(`/jobs/applications/${encodeURIComponent(jobId)}/priority`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prioritized }),
    }),
  /** A company's live openings (public read) — powers the drawer's one-tap
   *  "collect more roles here" list. */
  companyJobs: (company: string) =>
    request<CompanyJobsResponse>(
      `/companies/${encodeURIComponent(company)}/jobs?page=1&page_size=50`,
    ),
  // Delta-4 intent chat: talk to Myro when the feed disappoints → propose a diff.
  intentChat: (token: string, messages: IntentChatMessage[]) =>
    request<IntentChatResponse>("/jobs/intent-chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages }),
    }),
  applyIntentDiff: (token: string, diff: IntentFilterDiff) =>
    request<{ applied: boolean; changed: Record<string, unknown> }>("/jobs/intent-chat/apply", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ diff }),
    }),
  reportInactive: (token: string, jobId: string) =>
    request<{ report_count: number; already_reported: boolean; coins_earned: number }>(
      `/jobs/${encodeURIComponent(jobId)}/report`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
    ),
  updateApplication: (
    token: string,
    jobId: string,
    data: { status: ApplicationStatus; notes?: string | null; company_response?: string | null; followed_up?: boolean | null },
  ) =>
    request<ApplicationResponse>(`/jobs/applications/${jobId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    }),
  snoozeCollection: (token: string, jobId: string, days: number) =>
    request<ApplicationResponse>(`/jobs/applications/${encodeURIComponent(jobId)}/collection-snooze`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ days }),
    }),
  removeTrackerJob: (token: string, jobId: string) =>
    request<void>(`/jobs/tracker/${encodeURIComponent(jobId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
  restoreTrackerJob: (token: string, jobId: string) =>
    request<void>(`/jobs/tracker/${encodeURIComponent(jobId)}/restore`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  dismissStale: (token: string, jobId: string) =>
    request<void>(`/jobs/applications/${encodeURIComponent(jobId)}/dismiss-stale`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  importPreview: (
    token: string,
    body: { role_name: string; company_name?: string | null; location?: string | null; job_description: string; source_url?: string | null },
  ) =>
    request<{
      role_name: string
      company_name: string | null
      location: string | null
      job_description: string
      primary_skills: Array<{ label: string; taxonomy_key: string | null; confidence: number }>
      secondary_skills: Array<{ label: string; taxonomy_key: string | null; confidence: number }>
      emerging_skills: Array<{ label: string; skill_type: string; source: string }>
      warnings: string[]
    }>("/jobs/import/preview", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  importJob: (
    token: string,
    body: {
      role_name: string
      company_name?: string | null
      location?: string | null
      job_description: string
      source_url?: string | null
      source_platform?: string | null
      primary_skills: string[]
      secondary_skills: string[]
      emerging_skills?: Array<{ label: string; skill_type: string; source: string }>
      status?: ApplicationStatus
    },
  ) =>
    request<ApplicationResponse>("/jobs/import", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ emerging_skills: [], ...body }),
    }),
  // Parse an uploaded job posting (PDF / DOCX / image) into tracker fields.
  // Multipart, so it bypasses `request`'s JSON body handling. Free — no XP.
  extractFile: async (token: string, file: File): Promise<JobFileExtract> => {
    const form = new FormData()
    form.append("file", file)
    const res = await fetch(`${BASE}/jobs/import/extract-file`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new Error(extractError(body, res.status))
    return body as JobFileExtract
  },
  // Fetch a public posting URL server-side and parse it into tracker fields.
  // SSRF-guarded on the backend. Free — no XP.
  extractUrl: (token: string, url: string): Promise<JobFileExtract> =>
    request<JobFileExtract>("/jobs/import/extract-url", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url }),
    }),
  skillGap: (token: string, jobId: string) =>
    request<SkillGapResponse>(`/jobs/${jobId}/skill-gap`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** Full JD, on demand. List payloads carry only a 600-char snippet; call this
   *  when `job_description_truncated` is set and the user opened the JD panel. */
  jobDescription: (token: string, jobId: string) =>
    request<{ job_id: string; job_description: string }>(`/jobs/${jobId}/description`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** Free reach search (ADR-0018): roles to search for + URLs the user opens
   *  in their own browser. Myro never fetches the results. */
  reachSearch: (token: string, body: { job_title: string; company?: string | null; job_description?: string }) =>
    request<ReachSearchResponse>(`/jobs/reach/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  /** Purchased-state for a job's outreach pack — no charge (UI gate). */
  getReachPack: (token: string, jobId: string) =>
    request<ReachPackResponse>(`/jobs/${encodeURIComponent(jobId)}/reach/pack`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** Generate the 50-coin outreach pack (charge-on-success; replay free). */
  createReachPack: (token: string, jobId: string) =>
    request<ReachPackResponse>(`/jobs/${encodeURIComponent(jobId)}/reach/pack`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** Purchased-state for a job's day-of brief — no charge (UI gate). */
  getPrepBrief: (token: string, jobId: string) =>
    request<PrepBriefResponse>(`/jobs/${encodeURIComponent(jobId)}/prep/brief`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** Generate the 30-coin day-of brief (charge-on-success; replay free). */
  createPrepBrief: (token: string, jobId: string) =>
    request<PrepBriefResponse>(`/jobs/${encodeURIComponent(jobId)}/prep/brief`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** How many own-connections the user has uploaded (warm-intro source). */
  connectionsStatus: (token: string) =>
    request<{ count: number }>(`/cv/connections`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** Forget every uploaded connection (undo for the dump auto-save). */
  clearConnections: (token: string) =>
    request<{ count: number }>(`/cv/connections`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
  /** Upload the user's own LinkedIn Connections.csv export (ADR-0018 Path 1). */
  uploadConnections: async (token: string, file: File): Promise<{ count: number }> => {
    const form = new FormData()
    form.append("file", file)
    const res = await fetch(`${BASE}/cv/connections/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    if (!res.ok) {
      const msg = await res.text().catch(() => "Upload failed")
      throw new Error(msg)
    }
    return res.json()
  },
  analyseJob: (token: string, jobId: string) =>
    request<{ job_id: string; overlap_score: number; matched_count: number; total_skills: number; new_coin_balance: number }>(
      `/jobs/analyse/${jobId}`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
    ),
  /** SSE stream path for the streamed why-fit. Fed to useStreamingText.start(). */
  analyseStreamPath: (jobId: string) => `/jobs/analyse/${jobId}/stream`,
  /** SSE stream path for an XP-gated deepener (Q8). prompt_key ∈ DEEPEN_KEYS. */
  deepenStreamPath: (jobId: string, promptKey: string) =>
    `/jobs/${encodeURIComponent(jobId)}/deepen/${encodeURIComponent(promptKey)}/stream`,
  /** Already-purchased deepener answers for a job — lets the UI replay free + drop the 5 XP label. */
  deepenings: (token: string, jobId: string) =>
    request<{ items: DeepeningItem[]; sampled: boolean }>(
      `/jobs/${encodeURIComponent(jobId)}/deepenings`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
  path: (token: string, jobId: string) =>
    request<JobPathResponse>(`/jobs/applications/${encodeURIComponent(jobId)}/path`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  updateTargets: (token: string, jobId: string, targets: Array<{ skill: string; is_primary?: boolean | null }>) =>
    request<JobPathResponse>(`/jobs/applications/${encodeURIComponent(jobId)}/targets`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targets }),
    }),
  updateMilestone: (
    token: string,
    jobId: string,
    milestoneId: string,
    data: { proof?: string | null; impact?: string | null; confidence?: number | null; completed?: boolean },
  ) =>
    request<JobPathMilestone>(`/jobs/applications/${encodeURIComponent(jobId)}/milestones/${encodeURIComponent(milestoneId)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    }),
  /** Correct a mis-parsed role/company on an imported (ext_) job. */
  updateImportedDetails: (token: string, jobId: string, data: { title?: string; company?: string }) =>
    request<{ job_id: string; job_title: string; company: string | null }>(
      `/jobs/applications/${encodeURIComponent(jobId)}/imported-details`,
      { method: "PATCH", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(data) },
    ),
}

// ── Diary ────────────────────────────────────────────────────────────────────

export interface SkillDeltaItem {
  taxonomy_key: string
  xp_added: number
  evidence: string
}

export interface DiaryEntry {
  id: string
  log_date: string
  entry_text: string
  skills_delta: SkillDeltaItem[]
  score_before: number | null
  score_after: number | null
  created_at: string
  updated_at: string
}

export interface DiaryHistoryResponse {
  entries: DiaryEntry[]
  total: number
}

export interface Milestone {
  id: string
  job_id: string | null
  milestone_date: string
  skill: string | null
  task: string
  proof: string | null
  impact: string | null
  confidence: number
  completed_at: string | null
  created_at: string
  updated_at: string
  source_type: "personal" | "job"
}

export interface MilestoneListResponse {
  milestones: Milestone[]
  total: number
}

export interface MilestonePayload {
  milestone_date: string
  skill?: string | null
  task: string
  proof?: string | null
  impact?: string | null
  confidence?: number
  completed?: boolean
}

export const diary = {
  createEntry: (token: string, entryText: string, logDate?: string, cartSkills?: Record<string, unknown>[]) =>
    request<DiaryEntry>("/diary/entry", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ entry_text: entryText, log_date: logDate, cart_skills: cartSkills ?? [] }),
    }),
  history: (token: string, limit = 30) =>
    request<DiaryHistoryResponse>(`/diary/history?limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  milestones: (token: string, limit = 30) =>
    request<MilestoneListResponse>(`/diary/milestones?limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  saveMilestone: (token: string, data: MilestonePayload) =>
    request<Milestone>("/diary/milestones", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    }),
}

// ── Comments — PUBLIC community notes on job / company / skill entities ──
// Read is public (no token needed); writing/flagging requires auth. Author is
// shown via ninja_name only — user_id is never returned by the API.
export type CommentEntityType = "job" | "skill" | "company"

export interface Comment {
  id: string
  entity_type: CommentEntityType
  entity_id: string
  body: string
  created_at: string
  updated_at: string
  author_ninja_name: string | null
  is_own: boolean
}

export interface CommentListResponse {
  comments: Comment[]
  total: number
}

export interface CommentFlagResponse {
  comment_id: string
  report_count: number
  status: string
}

function commentAuthHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const comments = {
  // Public read — token optional (passed through only so the API can mark is_own).
  list: (token: string | null, entityType: CommentEntityType, entityId: string) =>
    request<CommentListResponse>(`/comments?entity_type=${entityType}&entity_id=${encodeURIComponent(entityId)}`, {
      headers: commentAuthHeaders(token),
    }),
  create: (token: string, entityType: CommentEntityType, entityId: string, body: string) =>
    request<Comment>("/comments", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, body }),
    }),
  update: (token: string, commentId: string, body: string) =>
    request<Comment>(`/comments/${commentId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ body }),
    }),
  remove: (token: string, commentId: string) =>
    request<void>(`/comments/${commentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
  flag: (token: string, commentId: string) =>
    request<CommentFlagResponse>(`/comments/${commentId}/flag`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
}

// ── Private notes — the user's OWN note per entity (never public, PV1-safe) ──
// One living note per entity; PUT upserts, GET returns { body: null } when none.
export type PrivateNoteEntityType = "job" | "skill" | "company" | "cv"

export interface PrivateNote {
  entity_type: PrivateNoteEntityType
  entity_id: string
  body: string | null
  updated_at: string | null
}

export const privateNotes = {
  get: (token: string, entityType: PrivateNoteEntityType, entityId: string) =>
    request<PrivateNote>(`/private-notes?entity_type=${entityType}&entity_id=${encodeURIComponent(entityId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  put: (token: string, entityType: PrivateNoteEntityType, entityId: string, body: string) =>
    request<PrivateNote>("/private-notes", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, body }),
    }),
}

// ── Skills ────────────────────────────────────────────────────────────────────

export interface Skill {
  id: number
  taxonomy_key: string
  display_name: string
  lightcast_id?: string
  l1_domain: string
  l2_cluster: string
}

export const skills = {
  all: () => request<{ skills: Skill[]; total: number }>("/skills").then((response) => response.skills),
  domains: () => request<string[]>("/skills/domains"),
}

// ── Billing ──────────────────────────────────────────────────────────────────

export type BillingProduct = "xp_pack" | "myrology" | "job_switch_plan"

export const BILLING_PRODUCT_AMOUNT_PAISE: Record<BillingProduct, number> = {
  xp_pack: 9900,
  myrology: 29900,
  job_switch_plan: 9900,
}

export interface RazorpayOrderResponse {
  order_id: string
  amount: number
  currency: string
  product: string
}

export interface RazorpayVerifyPayload {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

export interface RazorpayVerifyResponse {
  success: boolean
  coins_earned: number
  new_coin_balance: number
  product: string
  myrology_unlocked: boolean
  job_switch_plan_active: boolean
}

const BILLING_RECEIPT_PREFIX: Record<BillingProduct, string> = {
  xp_pack: "xp",
  myrology: "myro",
  job_switch_plan: "jsp",
}

export const billing = {
  createOrder: (token: string, product: BillingProduct = "xp_pack") =>
    request<RazorpayOrderResponse>("/api/create-order", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: BILLING_PRODUCT_AMOUNT_PAISE[product],
        currency: "INR",
        product,
        receipt: `${BILLING_RECEIPT_PREFIX[product]}_${Date.now()}`,
      }),
    }),

  verifyPayment: (token: string, payload: RazorpayVerifyPayload) =>
    request<RazorpayVerifyResponse>("/api/verify-payment", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
}

// ── Personalised Job-Switch Plan (#33) ───────────────────────────────────────

export interface JobSwitchPlanReview {
  id: string
  review_no: number
  status: "pending" | "in_progress" | "delivered"
  review_text: string | null
  sla_due_at: string
  requested_at: string
  delivered_at: string | null
}

export interface JobSwitchPlan {
  id: string
  target_role: string | null
  status: string
  reviews_used: number
  window_expires_at: string
  created_at: string
  reviews: JobSwitchPlanReview[]
  can_request_second_review: boolean
  window_open: boolean
}

export const jobSwitchPlan = {
  // null when the user hasn't purchased — the surface then shows the ₹99 offer.
  get: (token: string) =>
    request<JobSwitchPlan | null>("/job-switch-plan", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  requestReview: (token: string) =>
    request<JobSwitchPlanReview>("/job-switch-plan/request-review", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
}

// ── Myrology ───────────────────────────────────────────────────────────────

export interface MyrologyIntake {
  dob: string
  birth_time: string | null
  birth_time_unknown: boolean
  birth_place: string
  guidance_note: string | null
  updated_at: string
}

export interface MyrologyIntakePayload {
  dob: string
  birth_time: string | null
  birth_time_unknown: boolean
  birth_place: string
  guidance_note: string | null
}

export interface MyrologyBooking {
  id: string
  preferred_windows: string
  topic: string | null
  status: "requested" | "confirmed" | "done" | "cancelled"
  created_at: string
  confirmed_at: string | null
  done_at: string | null
  cancelled_at: string | null
}

export const myrology = {
  getIntake: (token: string) =>
    request<MyrologyIntake | null>("/myrology/intake", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  saveIntake: (token: string, payload: MyrologyIntakePayload) =>
    request<MyrologyIntake>("/myrology/intake", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  getBookings: (token: string) =>
    request<{ bookings: MyrologyBooking[] }>("/myrology/bookings", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  createBooking: (token: string, payload: { preferred_windows: string; topic: string | null }) =>
    request<MyrologyBooking>("/myrology/booking", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
}

// ── XP + Forge ───────────────────────────────────────────────────────────────

export interface XPBalanceResponse {
  balance: number
}

export const xp = {
  balance: (token: string) =>
    request<XPBalanceResponse>("/users/me/xp", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  spend: (token: string, amount: number, action: string) =>
    request<XPBalanceResponse>("/users/me/xp/spend", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount, action }),
    }),
}

// ── Feedback ─────────────────────────────────────────────────────────────────

export type FeedbackType =
  | "bug"
  | "idea"
  | "question"
  | "praise"
  | "feedback"
  | "company"

export type FeedbackStatus =
  | "received"
  | "triaged"
  | "in_progress"
  | "shipped"
  | "closed"

export type FeedbackSeverity = "low" | "medium" | "blocker"

export interface FeedbackReport {
  id: number
  type: FeedbackType
  status: FeedbackStatus
  payload: Record<string, unknown>
  created_at: string
}

export const feedback = {
  submit: (
    type: FeedbackType,
    payload: Record<string, unknown>,
    token?: string,
  ) =>
    request<{ ok: boolean; id: number }>("/feedback", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify({ type, payload }),
    }),

  listMine: (token: string, limit = 50) =>
    request<FeedbackReport[]>(`/feedback/my?limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  betaAssignmentStatus: (token: string) =>
    request<BetaAssignmentStatus>("/feedback/beta-assignment", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  submitBetaAssignment: (token: string, body: BetaFeedbackDraft) =>
    request<BetaAssignmentReceipt>("/feedback/beta-assignment", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
}

// ── Institutions (placement-cell beta applications) ─────────────────────────────

export interface InstitutionApplicationBody {
  institute_name: string
  contact_name: string
  contact_title: string
  email: string
  institute_type: string
  students_per_year: string
  primary_need?: string | null
  sso_provider?: "google-edu" | "microsoft-edu" | null
}

export const institutions = {
  apply: (body: InstitutionApplicationBody) =>
    request<{ ok: boolean; id: number }>("/institutions/apply", {
      method: "POST",
      body: JSON.stringify(body),
    }),
}

// ── Newsletter ──────────────────────────────────────────────────────────────

export type NewsletterSource = "web" | "landing" | "newsletter_page" | "app"

export const newsletter = {
  subscribe: (email: string, source: NewsletterSource = "web", token?: string) =>
    request<{ ok: boolean; already_subscribed?: boolean }>("/newsletter/subscribe", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify({ email, source }),
    }),
}

// ── Growth Command (private operator surface) ───────────────────────────────

export interface GrowthOperator {
  user_id: string
  role: "owner" | "editor" | "analyst"
  active: boolean
  display_name: string | null
}

export interface GrowthContentAsset {
  id: string
  legacy_key: string | null
  kind: string
  title: string
  slug: string | null
  summary: string | null
  canonical_url: string | null
  audience: string | null
  primary_action: string | null
  status: string
  sensitivity: string
  evidence_fresh_until: string | null
  metadata: Record<string, unknown>
  owner_id: string | null
  created_at: string | null
  updated_at: string | null
}

export interface GrowthCampaign {
  id: string
  legacy_key: string | null
  asset_id: string | null
  slug: string | null
  name: string
  objective: string | null
  audience: string | null
  status: string
  planned_at: string | null
  approved_by: string | null
  approved_by_label: string | null
  approved_at: string | null
  metadata: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
}

export interface GrowthMessage {
  id: string
  legacy_key: string | null
  campaign_id: string | null
  asset_id: string | null
  channel: string
  format: string | null
  variant: string
  audience: string | null
  intent: string | null
  subject: string | null
  draft_copy: string
  final_copy: string | null
  call_to_action_url: string | null
  utm_url: string | null
  composer_url: string | null
  status: string
  automation_level: string
  sensitivity: string
  reviewer_id: string | null
  approved_at: string | null
  planned_at: string | null
  failure_reason: string | null
  metadata: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
}

export interface GrowthPublication {
  id: string
  legacy_key: string | null
  message_id: string
  status: string
  live_url: string | null
  external_id: string | null
  final_copy_snapshot: string
  published_at: string | null
  outcome: Record<string, unknown>
  failure_details: string | null
  created_by: string | null
  created_at: string | null
}

export interface GrowthSeedingSweep {
  id: string
  legacy_key: string | null
  sweep_date: string
  title: string
  summary: string | null
  body: string
  metadata: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
}

export interface GrowthBootstrapResponse {
  operator: GrowthOperator
  assets: GrowthContentAsset[]
  campaigns: GrowthCampaign[]
  messages: GrowthMessage[]
  publications: GrowthPublication[]
  sweeps: GrowthSeedingSweep[]
  summary: {
    assets: number
    campaigns: number
    needs_review: number
    published: number
  }
}

export interface GrowthMessageUpdate {
  subject?: string | null
  draft_copy?: string | null
  final_copy?: string | null
  call_to_action_url?: string | null
  utm_url?: string | null
  composer_url?: string | null
  planned_at?: string | null
  status?: "draft" | "ready_for_review" | "paused"
}

export interface GrowthPublicationCreate {
  status?: "published" | "failed" | "deleted"
  live_url?: string | null
  external_id?: string | null
  final_copy_snapshot: string
  published_at?: string | null
  outcome?: Record<string, unknown>
  failure_details?: string | null
}

export interface GrowthMetricUpdate {
  impressions?: number | null
  clicks?: number | null
}

export interface LegacyGrowthPayload {
  assets: Array<Record<string, unknown>>
  campaigns: Array<Record<string, unknown>>
  messages: Array<Record<string, unknown>>
  publications: Array<Record<string, unknown>>
  sweeps: Array<Record<string, unknown>>
}

export const growth = {
  bootstrap: (token: string) =>
    request<GrowthBootstrapResponse>("/growth/bootstrap", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  requestAccess: (token: string, note?: string) =>
    request<{ ok: boolean; status: "pending" | "granted" }>(
      "/growth/access-request",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note: note ?? null }),
      },
    ),
  updateMessage: (token: string, messageId: string, body: GrowthMessageUpdate) =>
    request<GrowthMessage>(`/growth/messages/${encodeURIComponent(messageId)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  approveMessage: (token: string, messageId: string) =>
    request<GrowthMessage>(
      `/growth/messages/${encodeURIComponent(messageId)}/approve`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      },
    ),
  publishMessage: (
    token: string,
    messageId: string,
    body: GrowthPublicationCreate,
  ) =>
    request<GrowthPublication>(
      `/growth/messages/${encodeURIComponent(messageId)}/publish`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      },
    ),
  updatePublicationMetrics: (
    token: string,
    publicationId: string,
    body: GrowthMetricUpdate,
  ) =>
    request<GrowthPublication>(
      `/growth/publications/${encodeURIComponent(publicationId)}/metrics`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      },
    ),
  importLegacy: (token: string, body: LegacyGrowthPayload) =>
    request<{
      ok: boolean
      assets: number
      campaigns: number
      messages: number
      publications: number
      sweeps: number
    }>("/growth/import/legacy", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
}

// ── Public stats (landing-page Engine counters) ─────────────────────────────
// No-auth, 1h server cache. Display floors so the numbers never appear to go
// down between visits (design handoff §PRIORITY DIRECTIVE).

/** Where the pool came from + how much of it we have recently seen alive.
 *  `mine` is 0 on the public counters — only the authed read fills it. */
export interface JobProvenance {
  total: number
  agent: number
  community: number
  verified_live: number
  verified_window_days: number
  mine: number
}

export interface PublicStatsResponse {
  jobs_tracked: number
  companies_monitored: number
  skills_mapped: number
  seekers: number
  provenance: JobProvenance
  as_of: string
}

export const publicStats = {
  get: () => request<PublicStatsResponse>("/public/stats"),
}

// ── Public CV-score preview (no auth) ───────────────────────────────────────
// The pre-login "drop your CV → real Myro Score" demo. Multipart, no token —
// bypasses `request`'s JSON handling. Backend runs the real engine compute-only
// and persists nothing (PV1). Everything actionable stays gated behind signup.

export interface AnonDomainScore {
  name: string
  score: number
}

export interface AnonContact {
  name: string
  title: string
  email: string
  phone: string
  location: string
  linkedin: string
}

export interface AnonScoreResponse {
  score: number
  verdict: string
  domains: AnonDomainScore[]
  gaps: AnonDomainScore[]
  strengths: AnonDomainScore[]
  skills_detected: number
  // The parsed CV reformatted to the Myro standard (PdfPage shape). Null when
  // extraction was degraded — the readout then shows the score only.
  cv: CVStructured | null
  contact: AnonContact | null
}

export interface PublicJobFitPreviewResponse {
  job_id: string
  title: string
  company: string | null
  fit_pct: number
  matched_count: number
  total_skills: number
  matched_skills: string[]
  missing_skills: string[]
  cv_preview: AnonScoreResponse
}

export interface AnonRewriteResponse {
  mode: "rewrite" | "question" | "error"
  rewritten_text: string | null
  question: string | null
  rationale: string | null
}

export interface AnonRewriteVariant {
  angle: string
  label: string
  text: string
  why?: string
}

export interface AnonRewriteVariantsResponse {
  mode: "variants" | "question" | "error"
  variants: AnonRewriteVariant[]
  question: string | null
  rationale: string | null
}

export interface AnonRestructureResponse {
  mode: "proposal" | "error"
  proposed_text: string | null
  changes: string[]
  rationale: string | null
  playbook: string | null
  uncertainty: string | null
}

async function postPublicJson<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  if (!BASE) throw new Error("API base URL is not configured.")
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(extractError(body, res.status))
  return body as T
}

// Anon binary POST (e.g. WYSIWYG PDF export). Mirrors postPublicJson but
// returns the raw Blob; the error body is text (may be JSON detail).
async function postPublicBlob(path: string, payload: Record<string, unknown>): Promise<Blob> {
  if (!BASE) throw new Error("API base URL is not configured.")
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => "PDF generation failed")
    throw new Error(msg)
  }
  return res.blob()
}

// Public job-gen search (#33) — NL prompt → REAL openings only. No fabrication;
// apply/save stay gated to signup. `relaxed` lists any filter dropped to surface
// the closest real roles (e.g. ["location"]) so the UI can say "showing closest".
export interface PublicJobSearchCard {
  job_id: string
  title: string
  company: string | null
  location: string | null
  location_city: string | null
  location_country: string | null
  location_mode: string | null
  first_seen: string | null
}
export interface PublicJobSearchInterpreted {
  role: string
  location_city: string | null
  location_country: string | null
  location_mode: string | null
  skills: string[]
}
export interface PublicJobSearchResponse {
  cards: PublicJobSearchCard[]
  total: number
  interpreted: PublicJobSearchInterpreted
  relaxed: string[]
}

export const publicCv = {
  searchJobs: async (payload: {
    query: string
    turnstileToken?: string | null
  }): Promise<PublicJobSearchResponse> =>
    postPublicJson<PublicJobSearchResponse>("/public/job-search", {
      query: payload.query,
      cf_turnstile_token: payload.turnstileToken ?? (await getTurnstileToken()),
      session_id: getAnonSessionId(),
    }),

  // Metadata-only telemetry for a pre-login CV download (#34 S6). Fire-and-forget:
  // the download already happened, so a failure must never block or surface.
  recordDownloadEvent: (payload: {
    anonSessionId: string
    score?: number | null
    fixCount?: number | null
    careerLevel?: string | null
    fileFormat?: string | null
    savedIntent?: boolean
  }): void => {
    if (!BASE) return
    void fetch(`${BASE}/public/cv-download-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        anon_session_id: payload.anonSessionId,
        score: payload.score ?? null,
        fix_count: payload.fixCount ?? null,
        career_level: payload.careerLevel ?? null,
        file_format: payload.fileFormat ?? null,
        saved_intent: payload.savedIntent ?? false,
      }),
    }).catch(() => {})
  },

  // WYSIWYG PDF export for the logged-out playground (ADR-0020). Posts the
  // SAME `.cvb-pdf-page` outerHTML the user previews to the SAME Chromium
  // renderer the authed download uses — no browser-print divergence. Throws
  // on 503 so the caller can fall back to native print (a visible sheet exists).
  exportPdf: async (
    html: string,
    filename: string,
    turnstileToken?: string | null,
  ): Promise<Blob> =>
    postPublicBlob("/public/cv/export-pdf", {
      html,
      filename,
      cf_turnstile_token: turnstileToken ?? (await getTurnstileToken()),
    }),

  scorePreview: async (input: File | { text: string }, turnstileToken?: string | null): Promise<AnonScoreResponse> => {
    if (!BASE) throw new Error("API base URL is not configured.")
    const token = turnstileToken ?? (await getTurnstileToken())
    const form = new FormData()
    // Paste path (#4): a small text POST that dodges the multipart-upload
    // failures some networks/regions hit; the file path is unchanged.
    if (input instanceof File) form.append("file", input)
    else form.append("text", input.text)
    if (token) form.append("cf_turnstile_token", token)
    const res = await fetch(`${BASE}/public/score-cv`, { method: "POST", body: form })
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new Error(extractError(body, res.status))
    return body as AnonScoreResponse
  },

  jobFitPreview: async (
    jobId: string,
    file: File,
    turnstileToken?: string | null,
  ): Promise<PublicJobFitPreviewResponse> => {
    if (!BASE) throw new Error("API base URL is not configured.")
    const token = turnstileToken ?? (await getTurnstileToken())
    const form = new FormData()
    form.append("file", file)
    if (token) form.append("cf_turnstile_token", token)
    const res = await fetch(`${BASE}/public/jobs/${encodeURIComponent(jobId)}/fit-preview`, {
      method: "POST",
      body: form,
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new Error(extractError(body, res.status))
    return body as PublicJobFitPreviewResponse
  },

  // Pre-login playground AI — compute-only, persists nothing (PV1). Same pure
  // services as the authed surface; anon is free (loss-leader, neutralised by
  // the welcome grant). No job → role/keywords optional → generic best-practice.
  rewriteBullet: async (payload: {
    bullet: string
    role?: string | null
    missing_keywords?: string[]
    metric?: string | null
    allow_no_metric?: boolean
    turnstileToken?: string | null
  }): Promise<AnonRewriteResponse> =>
    postPublicJson<AnonRewriteResponse>("/public/rewrite-bullet", {
      bullet: payload.bullet,
      role: payload.role ?? null,
      missing_keywords: payload.missing_keywords ?? [],
      metric: payload.metric ?? null,
      allow_no_metric: payload.allow_no_metric ?? false,
      cf_turnstile_token: payload.turnstileToken ?? (await getTurnstileToken()),
    }),

  rewriteBulletVariants: async (payload: {
    bullet: string
    role?: string | null
    missing_keywords?: string[]
    metric?: string | null
    allow_no_metric?: boolean
    turnstileToken?: string | null
  }): Promise<AnonRewriteVariantsResponse> =>
    postPublicJson<AnonRewriteVariantsResponse>("/public/rewrite-bullet/variants", {
      bullet: payload.bullet,
      role: payload.role ?? null,
      missing_keywords: payload.missing_keywords ?? [],
      metric: payload.metric ?? null,
      allow_no_metric: payload.allow_no_metric ?? false,
      cf_turnstile_token: payload.turnstileToken ?? (await getTurnstileToken()),
    }),

  restructure: async (payload: {
    cv_text: string
    role?: string | null
    company?: string | null
    missing_keywords?: string[]
    turnstileToken?: string | null
  }): Promise<AnonRestructureResponse> =>
    postPublicJson<AnonRestructureResponse>("/public/restructure", {
      cv_text: payload.cv_text,
      role: payload.role ?? null,
      company: payload.company ?? null,
      missing_keywords: payload.missing_keywords ?? [],
      cf_turnstile_token: payload.turnstileToken ?? (await getTurnstileToken()),
    }),
}

// ── Home bootstrap (BFF) ────────────────────────────────────────────────────
// One round-trip that returns the whole above-the-fold dashboard bundle, so the
// client makes a single call instead of ~9 to paint home. Each field mirrors the
// payload of its standalone endpoint; the client seeds its TanStack cache from
// this bundle (see useHomeBootstrap).
export interface HomeBootstrapResponse {
  profile: UserProfile
  score: ScoreResponse | null
  matches: JobMatchesResponse
  applications: ApplicationResponse[]
  evidence: CVEvidenceSummary
  cv_versions: { versions: CVVersion[] }
  practice_activity: { dates: string[] }
  diary: DiaryHistoryResponse
}

export const home = {
  bootstrap: (token: string) =>
    request<HomeBootstrapResponse>("/home/bootstrap", {
      headers: { Authorization: `Bearer ${token}` },
    }),
}

// ── Upskilling (Practice → Upskilling overhaul, PRD §7) ──────────────────────

export interface UpskillingSkill {
  skill_id: number
  skill_key: string
  display_name: string
  cleared_level: number
  next_level: number
  assessed_level: number
  on_cv: boolean
  demand: string
  job_count: number
  max_bank_level: number
  locked: boolean
}

/** A served question — the answer key is withheld until grading. */
export interface ServedQuestion {
  id: number
  question_text: string
  options: string[]
}

export interface StartSetResponse {
  set_id: string
  skill_id: number
  skill_key: string
  level: number
  questions: ServedQuestion[]
}

export interface QuestionResult {
  question_id: number
  correct_index: number
  is_correct: boolean
  explanation: string
  rationales?: {
    correct?: string
    distractors?: Record<string, string>
  }
}

export interface SubmitSetResponse {
  score: number
  max: number
  passed: boolean
  first_clear: boolean
  tokens_awarded: number
  next_level_unlocked: number | null
  results: QuestionResult[]
}

export interface LearningCoverageResponse {
  coverage_gate_met: boolean
  publication_scope: "partial" | "comprehensive"
  complete_skill_count: number
  target_skill_min: number
  target_skill_max: number
  questions_per_level_min: number
  questions_per_level_max: number
  active_reviewed_question_count: number
  active_reviewed_skill_count: number
}

// ── Surface B — job-anchored gap calibration ────────────────────────────────

export interface GapSkillSet {
  skill_id: number
  skill_key: string
  display_name: string
  target_level: number
  calibration_set: ServedQuestion[]
}

export interface StartGapResponse {
  assessment_id: string
  job_id: string
  job_title: string | null
  company_name: string | null
  skills: GapSkillSet[]
  /** Why skills is empty: "no_gaps" (CV already meets levels) | "no_bank". */
  reason?: "no_gaps" | "no_bank" | null
}

export interface ReadinessRow {
  skill_id: number
  skill_key: string
  skill: string
  assessed_level: number
  target_level: number
  band: "ready" | "close" | "gap"
  why_it_matters: string | null
  practice_href: string
}

export interface SubmitGapResponse {
  readiness: ReadinessRow[]
  overall_readiness_pct: number
}

export const upskilling = {
  skills: (token: string) =>
    request<UpskillingSkill[]>("/upskilling/skills", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  startSet: (token: string, skillId: number, level: number) =>
    request<StartSetResponse>("/upskilling/sets", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ skill_id: skillId, level }),
    }),

  submitSet: (
    token: string,
    setId: string,
    answers: Array<{ question_id: number; selected_index: number }>,
    idempotencyKey: string,
  ) =>
    request<SubmitSetResponse>(`/upskilling/sets/${encodeURIComponent(setId)}/submit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ answers, idempotency_key: idempotencyKey }),
    }),

  startGap: (token: string, jobId: string) =>
    request<StartGapResponse>(`/upskilling/gap/${encodeURIComponent(jobId)}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),

  submitGap: (
    token: string,
    jobId: string,
    assessmentId: string,
    answers: Array<{ question_id: number; selected_index: number }>,
  ) =>
    request<SubmitGapResponse>(`/upskilling/gap/${encodeURIComponent(jobId)}/submit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ assessment_id: assessmentId, answers }),
    }),

  /** Recent upskilling-set submission dates — powers the home practice streak. */
  activityDates: (token: string) =>
    request<{ dates: string[] }>("/upskilling/activity", {
      headers: { Authorization: `Bearer ${token}` },
    }),

  coverage: (token: string) =>
    request<LearningCoverageResponse>("/upskilling/coverage", {
      headers: { Authorization: `Bearer ${token}` },
    }),
}

// ── Health ────────────────────────────────────────────────────────────────────

export const health = () => request<{ status: string }>("/health")
