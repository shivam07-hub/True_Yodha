/**
 * Typed API client for the Mirror FastAPI backend.
 * All server state should be fetched through this file.
 * Never call fetch() directly in components — use TanStack Query + these functions.
 */

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
import { ApiError, classifyError, readTraceId } from "./api-error"

/**
 * Hard ceiling on a single request. Without this a server that accepts the
 * connection but never responds leaves the promise pending forever — which is
 * exactly what wedges the dashboard on its skeleton. On fire → AbortError →
 * classifyError → ApiError{kind:"timeout"} → the failure UI can react.
 */
const REQUEST_TIMEOUT_MS = 15_000

/** Combine the caller's AbortSignal (if any) with a timeout into one signal. */
function withTimeout(signal: AbortSignal | null | undefined): {
  signal: AbortSignal
  done: () => void
} {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException("Timeout", "AbortError")), REQUEST_TIMEOUT_MS)
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
  clearSessionTokens()
  if (typeof window !== "undefined") window.location.href = "/login"
  throw new Error("Session expired. Please sign in again.")
}

async function request<T>(path: string, init?: RequestInit, _isRetry = false): Promise<T> {
  const { headers: extraHeaders, signal: callerSignal, ...rest } = init ?? {}
  const { signal, done } = withTimeout(callerSignal)
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
    })
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  access_token: string | null
  refresh_token: string | null
  token_type: string
  user_id: string
  email: string | null
  requires_email_confirmation: boolean
  message: string | null
}

export interface PostSigninResponse {
  user_id: string
  provider: string | null
  referral_attributed: boolean
  linkedin_xp_granted: boolean
  linkedin_url_set: boolean
}

export interface PostSigninRequestBody {
  provider?: string | null
  myro_ref?: string | null
  linkedin_vanity?: string | null
  linkedin_headline?: string | null
  linkedin_verified?: boolean | null
}

export interface MagicLinkResponse {
  sent: boolean
  message: string
  retry_after_seconds?: number | null
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
  user_id: string
  email: string | null
}

export const auth = {
  signup: (email: string, password: string, fullName?: string | null, myroRef?: string | null) =>
    request<AuthResponse>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, full_name: fullName, myro_ref: myroRef ?? null }),
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
  id: string
  email: string
  full_name: string | null
  linkedin_url: string | null
  target_roles: string[]
  target_location: string | null
  target_locations: string[]
  deal_breakers: string[]
  career_goal: string | null
  superpower: string | null
  cv_url: string | null
  onboarding_complete: boolean
  created_at: string
  last_active_at: string
  ninja_name: string | null
  referred_by_user_id: string | null
  has_cv: boolean
  cv_readiness?: "ready" | "missing" | "processing" | "failed"
  cv_upload_job_id?: string | null
  cv_upload_error_code?: string | null
  myrology_unlocked?: boolean
  myrology_interested?: boolean
}

export interface ProfileUpdateResponse extends UserProfile {
  xp_earned: number
  new_xp_balance: number | null
}

export interface ProfileUpdate {
  full_name?: string | null
  linkedin_url?: string | null
  target_roles?: string[] | null
  target_location?: string | null
  target_locations?: string[] | null
  deal_breakers?: string[] | null
  career_goal?: string | null
  superpower?: string | null
  myrology_interested?: boolean
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

export const users = {
  me: (token: string) =>
    request<UserProfile>("/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  mySkills: (token: string) =>
    request<UserSkillsByDomain>("/users/me/skills", {
      headers: { Authorization: `Bearer ${token}` },
    }),
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
    request<{ company_name: string; new_xp_balance: number | null }>("/users/me/following/companies", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ company_name: companyName }),
    }),
  unfollowCompany: (token: string, companyName: string) =>
    request<void>(`/users/me/following/companies/${encodeURIComponent(companyName)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
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

export interface CVStructured {
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
  body_text: string
  polished_text: string | null
  ai_polished: boolean
  created_at: string
  job_title: string | null
  company_name: string | null
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
  mode: "rewrite" | "question" | "error"
  rewritten_text?: string | null
  question?: string | null
  rationale?: string | null
}

export const cv = {
  evidence: (token: string) =>
    request<CVEvidenceSummary>("/cv/evidence", {
      headers: { Authorization: `Bearer ${token}` },
    }),
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
  downloadPdf: async (token: string, cvText: string, filename?: string): Promise<Blob> => {
    const res = await fetch(`${BASE}/cv/download-pdf`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cv_text: cvText, filename }),
    })
    if (!res.ok) {
      const msg = await res.text().catch(() => "PDF generation failed")
      throw new Error(msg)
    }
    return res.blob()
  },
  // WYSIWYG PDF export. The body carries the literal rendered .cvb-pdf-page
  // outerHTML — the SAME DOM the user previewed — and headless Chromium renders
  // it server-side with the shared sheet stylesheet, so the PDF is byte-faithful
  // to the preview (no plain-text round-trip like downloadPdf). On 503 the caller
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
const CV_UPLOAD_JOB_KEY = "myro_cv_upload_job_v1"
const CV_UPLOAD_IDEM_KEY = "myro_cv_upload_idem_v1"
const CV_UPLOAD_TELEMETRY_PATH = "/v1/telemetry/cv-upload-phase"

function _newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function _persistUploadJob(jobId: string): void {
  try { localStorage.setItem(CV_UPLOAD_JOB_KEY, jobId) } catch { /* private mode */ }
}

function _readUploadIdemKey(): string | null {
  try { return localStorage.getItem(CV_UPLOAD_IDEM_KEY) } catch { return null }
}

function _persistUploadIdemKey(key: string): void {
  try { localStorage.setItem(CV_UPLOAD_IDEM_KEY, key) } catch { /* private mode */ }
}

function _clearUploadPersistence(opts: { clearIdem: boolean }): void {
  try {
    localStorage.removeItem(CV_UPLOAD_JOB_KEY)
    if (opts.clearIdem) localStorage.removeItem(CV_UPLOAD_IDEM_KEY)
  } catch {
    /* private mode */
  }
}

/** Returns the in-flight job_id stored from a prior session, if any. */
export function getPersistedCVUploadJobId(): string | null {
  try { return localStorage.getItem(CV_UPLOAD_JOB_KEY) } catch { return null }
}

export function clearPersistedCVUploadState(opts: { clearIdem?: boolean } = {}): void {
  _clearUploadPersistence({ clearIdem: opts.clearIdem ?? true })
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

export type CVUploadSource = "pdf_upload" | "text_describe" | "linkedin_pdf"

export async function uploadCV(
  token: string,
  file: File,
  source: CVUploadSource = "pdf_upload",
  onProgress?: (status: CVUploadStatusResponse) => void,
): Promise<CVUploadResult> {
  const idempotencyKey = _readUploadIdemKey() ?? _newIdempotencyKey()
  _persistUploadIdemKey(idempotencyKey)
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
    _clearUploadPersistence({ clearIdem: true })
    throw failure
  }

  try {
    const initial = await _postCVUpload(token, safeFile, idempotencyKey, source)
    if (initial.status === "processing") _persistUploadJob(initial.job_id)
    const result = await _resolveUploadResult(
      token,
      initial,
      { idempotencyKey, fileName: safeFile.name, fileMime: safeFile.type, fileBytes: safeFile.size },
      onProgress,
    )
    _clearUploadPersistence({ clearIdem: true })
    return result
  } catch (err) {
    const failure = _asUploadFailure(err, "put")
    if (!failure.retryable) _clearUploadPersistence({ clearIdem: true })
    throw failure
  }
}

export async function uploadCVText(token: string, text: string, source: CVUploadSource = "text_describe"): Promise<CVUploadResult> {
  const idempotencyKey = _readUploadIdemKey() ?? _newIdempotencyKey()
  _persistUploadIdemKey(idempotencyKey)
  try {
    const initial = await request<CVUploadResponse>("/cv/text", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, idempotency_key: idempotencyKey, source }),
    })
    if (initial.status === "processing") _persistUploadJob(initial.job_id)
    const result = await _resolveUploadResult(token, initial, { idempotencyKey })
    _clearUploadPersistence({ clearIdem: true })
    return result
  } catch (err) {
    const failure = _asUploadFailure(err, "poll")
    if (!failure.retryable) _clearUploadPersistence({ clearIdem: true })
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
    idempotencyKey: _readUploadIdemKey(),
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
            idempotencyKey: _readUploadIdemKey(),
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
      idempotencyKey: _readUploadIdemKey(),
    })
    _emitCVUploadTelemetry(token, {
      phase: "parse",
      outcome: "succeeded",
      jobId,
      idempotencyKey: _readUploadIdemKey(),
    })
    return result
  } catch (err) {
    const failure = _asUploadFailure(err, "poll")
    _emitCVUploadTelemetry(token, {
      phase: failure.phase ?? "poll",
      outcome: "failed",
      jobId,
      idempotencyKey: _readUploadIdemKey(),
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
}

export interface ScoreResponse {
  total_score: number
  domain_scores: Record<string, number>
  gap_skills: GapSkill[]
  skills_assessed: number
  computed_at: string
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
  llm_rank: number | null
  llm_explanation: string | null
  batch_week: string
  source_url: string | null
  matched_skills: string[]
  job_description?: string | null
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
}

export interface JobMatchesResponse {
  jobs: JobMatch[]
  batch_week: string
  total: number
  feed_updated_at: string | null
  matches_computed_at: string | null
  dismissed_job_ids: string[]
}

export type RefreshLifecycle = "queued" | "computing" | "done" | "failed"
export type RefreshOutcomeKind = "written" | "cache_hit" | "exhausted" | "needs_onboarding"

export interface RefreshTicketResponse {
  id: string
  state: "queued" | "computing" | "done"
  progress_label: string
  batch_week: string
  xp_charged: number
  new_xp_balance: number
  matches_written: number | null
}

export interface RefreshStateResponse {
  ticket_id: string
  state: RefreshLifecycle
  progress_label: string
  batch_week: string
  matches_written: number | null
  refund: number | null
  new_xp_balance: number | null
  outcome_kind: RefreshOutcomeKind | null
  error: string | null
  debug: Record<string, unknown> | null
}

export type ApplicationStatus =
  | "saved"
  | "applied"
  | "screening"
  | "interviewing"
  | "final_round"
  | "ghosted"
  | "rejected"
  | "offer"
  | "withdrew"

export const APPLICATION_STAGES: ApplicationStatus[] = ["saved", "applied", "screening", "interviewing", "final_round"]
export const APPLICATION_OUTCOMES: ApplicationStatus[] = ["ghosted", "rejected", "offer", "withdrew"]

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
  is_first_offer?: boolean
  cv_badge?: CVBadge | null
  xp_earned?: number | null
  xp_balance?: number | null
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
export type JobFeedSort = "fit" | "fresh" | "personal" | "company" | "role"

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
  industry?: string | null
  source_url?: string | null
  first_seen?: string | null
  last_seen_at?: string | null  // ISO date the scraper last confirmed it live
  is_stale?: boolean            // unseen >21d — warn before the Apply link 404s
  is_active: boolean
  skills: string[]
  matched_skill_count: number
  target_role_match: number  // how many of the user's target roles this job covers
}

export interface JobFeedResponse {
  jobs: JobFeedItem[]
  available_total: number
  returned_total: number
  page: number
  page_size: number
  has_next_page: boolean
  sort: JobFeedSort
}

export interface JobFeedParams {
  cluster?: string | null
  roleDomain?: string | null
  q?: string | null
  locationCity?: string | null
  locationCountry?: string | null
  locationMode?: "onsite" | "hybrid" | "remote" | "unknown" | null
  sort?: JobFeedSort
  minSkillMatches?: number
  targetRoleOnly?: boolean
  freshnessDays?: number
  followingOnly?: boolean
  page?: number
  pageSize?: number
}

export interface MarketAnalytics {
  total_jobs: number
  total_companies: number
  total_industries: number
  latest_batch?: string | null
  total_jobs_today?: number
  jobs_added_1h?: number
  companies_added_7d?: number
  by_company: NameCountItem[]
  by_industry: NameCountItem[]
  by_role: NameCountItem[]
  by_location_city: NameCountItem[]
  by_location_country: NameCountItem[]
  by_location_mode: NameCountItem[]
}

export interface EntitySkillsData {
  entity: string
  type: string
  skills: SkillCountItem[]
}

export interface SkillHeatmapData {
  matrix: Record<string, Record<string, number>>
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

export const jobs = {
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
  skillHeatmap: (companies: string[], skills: string[]) => {
    const params = new URLSearchParams({
      companies: companies.join(","),
      skills: skills.join(","),
    })
    return request<SkillHeatmapData>(`/jobs/analytics/skill-heatmap?${params.toString()}`)
  },
  skillHeatmapRow: (company: string, skills: string[], locationFilters?: JobLocationFilters) => {
    const params = new URLSearchParams({ companies: company, skills: skills.join(",") })
    if (locationFilters?.locationCity?.trim()) params.set("location_city", locationFilters.locationCity.trim())
    if (locationFilters?.locationCountry?.trim()) params.set("location_country", locationFilters.locationCountry.trim())
    if (locationFilters?.locationMode?.trim()) params.set("location_mode", locationFilters.locationMode.trim())
    return request<SkillHeatmapData>(`/jobs/analytics/skill-heatmap?${params.toString()}`)
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
    if (p.locationCity && p.locationCity.trim()) params.set("location_city", p.locationCity.trim())
    if (p.locationCountry && p.locationCountry.trim()) params.set("location_country", p.locationCountry.trim())
    if (p.locationMode && p.locationMode.trim()) params.set("location_mode", p.locationMode.trim())
    if (p.sort) params.set("sort", p.sort)
    if (p.minSkillMatches && p.minSkillMatches > 0) params.set("min_skill_matches", String(p.minSkillMatches))
    if (p.targetRoleOnly) params.set("target_role_only", "true")
    if (p.freshnessDays && p.freshnessDays > 0) params.set("freshness_days", String(p.freshnessDays))
    if (p.followingOnly) params.set("following_only", "true")
    if (p.page && p.page > 0) params.set("page", String(p.page))
    if (p.pageSize && p.pageSize > 0) params.set("page_size", String(p.pageSize))
    const qs = params.toString()
    return request<JobFeedResponse>(`/jobs/feed${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  },
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
  mySkillDemand: (token: string) =>
    request<UserSkillDemandResponse>("/jobs/my-skills/demand", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  matches: (token: string) =>
    request<JobMatchesResponse>("/jobs/matches", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  dismissMatchCard: (token: string, jobId: string) =>
    request<void>(`/jobs/matches/${encodeURIComponent(jobId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
  refresh: (token: string) =>
    request<RefreshTicketResponse>("/jobs/refresh", {
      method: "POST",
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
  reportInactive: (token: string, jobId: string) =>
    request<{ report_count: number; already_reported: boolean; xp_earned: number }>(
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
  removeTrackerJob: (token: string, jobId: string) =>
    request<void>(`/jobs/tracker/${encodeURIComponent(jobId)}`, {
      method: "DELETE",
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
  skillGap: (token: string, jobId: string) =>
    request<SkillGapResponse>(`/jobs/${jobId}/skill-gap`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  analyseJob: (token: string, jobId: string) =>
    request<{ job_id: string; overlap_score: number; matched_count: number; total_skills: number; new_xp_balance: number }>(
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

// ── Comments (PR-B) — private note threads on job + skill cards ──
export type CommentEntityType = "job" | "skill" | "company"

export interface Comment {
  id: string
  entity_type: CommentEntityType
  entity_id: string
  body: string
  created_at: string
  updated_at: string
}

export interface CommentListResponse {
  comments: Comment[]
  total: number
}

export const comments = {
  list: (token: string, entityType: CommentEntityType, entityId: string) =>
    request<CommentListResponse>(`/comments?entity_type=${entityType}&entity_id=${encodeURIComponent(entityId)}`, {
      headers: { Authorization: `Bearer ${token}` },
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
  all: () => request<Skill[]>("/skills"),
  domains: () => request<string[]>("/skills/domains"),
}

// ── Billing ──────────────────────────────────────────────────────────────────

export type BillingProduct = "xp_pack" | "myrology"

export const BILLING_PRODUCT_AMOUNT_PAISE: Record<BillingProduct, number> = {
  xp_pack: 9900,
  myrology: 49900,
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
  xp_earned: number
  new_xp_balance: number
  product: string
  myrology_unlocked: boolean
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
        receipt: `${product === "myrology" ? "myro" : "xp"}_${Date.now()}`,
      }),
    }),

  verifyPayment: (token: string, payload: RazorpayVerifyPayload) =>
    request<RazorpayVerifyResponse>("/api/verify-payment", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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

// ── Public stats (landing-page Engine counters) ─────────────────────────────
// No-auth, 1h server cache. Display floors so the numbers never appear to go
// down between visits (design handoff §PRIORITY DIRECTIVE).

export interface PublicStatsResponse {
  jobs_tracked: number
  companies_monitored: number
  skills_mapped: number
  seekers: number
  as_of: string
}

export const publicStats = {
  get: () => request<PublicStatsResponse>("/public/stats"),
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
}

export interface SubmitSetResponse {
  score: number
  max: number
  passed: boolean
  first_clear: boolean
  tokens_awarded: number
  new_xp_balance: number
  next_level_unlocked: number | null
  results: QuestionResult[]
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
}

// ── Health ────────────────────────────────────────────────────────────────────

export const health = () => request<{ status: string }>("/health")
