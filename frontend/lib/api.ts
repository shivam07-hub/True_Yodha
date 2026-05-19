/**
 * Typed API client for the Mirror FastAPI backend.
 * All server state should be fetched through this file.
 * Never call fetch() directly in components — use TanStack Query + these functions.
 */

import { clearSessionTokens, getRefreshToken, setSessionTokens } from "./session"
import { queryClient } from "./query-client"

const BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  ""

function extractError(body: unknown, status: number): string {
  if (typeof body !== "object" || body === null) return `HTTP ${status}`
  const detail = (body as Record<string, unknown>).detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) return detail.map((e: { msg?: string }) => e.msg ?? JSON.stringify(e)).join("; ")
  return `HTTP ${status}`
}

// Deduplicates concurrent refresh calls within a tab — Supabase rotates refresh
// tokens on each use, so parallel 401s must share one refresh or the second
// invalidates the first.
let _refreshInFlight: Promise<string | null> | null = null

// Cross-tab lock: prevents multiple tabs from racing to call /auth/refresh.
// Key must stay in sync with ACCESS_TOKEN_KEY in lib/session.ts.
const _CROSS_TAB_LOCK_KEY = "mirror_refresh_lock"
const _ACCESS_TOKEN_STORAGE_KEY = "mirror_token"
const _LOCK_TTL = 6000 // ms — must exceed worst-case refresh round-trip

function _acquireRefreshLock(): boolean {
  try {
    const val = window.localStorage.getItem(_CROSS_TAB_LOCK_KEY)
    if (val && Date.now() - parseInt(val, 10) < _LOCK_TTL) return false
    window.localStorage.setItem(_CROSS_TAB_LOCK_KEY, String(Date.now()))
    return true
  } catch {
    return true
  }
}

function _releaseRefreshLock(): void {
  try { window.localStorage.removeItem(_CROSS_TAB_LOCK_KEY) } catch {}
}

// Waits for another tab to write a fresh access token to localStorage.
function _waitForCrossTabToken(): Promise<string | null> {
  return new Promise((resolve) => {
    const handler = (e: StorageEvent) => {
      if (e.key === _ACCESS_TOKEN_STORAGE_KEY && e.newValue) {
        window.removeEventListener("storage", handler)
        clearTimeout(timer)
        resolve(e.newValue)
      }
    }
    const timer = setTimeout(() => {
      window.removeEventListener("storage", handler)
      resolve(null)
    }, _LOCK_TTL)
    window.addEventListener("storage", handler)
  })
}

async function tryRefreshToken(): Promise<string | null> {
  if (typeof window === "undefined") return null
  if (_refreshInFlight) return _refreshInFlight
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null

  // Another tab already holds the lock — wait for it to write the new token.
  if (!_acquireRefreshLock()) return _waitForCrossTabToken()

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
      _releaseRefreshLock()
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
  const { headers: extraHeaders, ...rest } = init ?? {}
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...extraHeaders },
    ...rest,
  })
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      if (!_isRetry) {
        const newToken = await tryRefreshToken()
        if (newToken) {
          // Patch Authorization header with new token and retry once
          const newHeaders = { ...(extraHeaders as Record<string, string> ?? {}), Authorization: `Bearer ${newToken}` }
          return request<T>(path, { ...rest, headers: newHeaders }, true)
        }
      }
      forceLogout()
    }
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(extractError(body, res.status))
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

interface SSEMessage<T> {
  event: string
  data: T
}

async function streamSSE<T>(
  path: string,
  token: string,
  onMessage: (message: SSEMessage<T>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
    signal,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(extractError(body, response.status))
  }
  if (!response.body) {
    throw new Error("Streaming not supported in this environment.")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    while (true) {
      const splitIndex = buffer.indexOf("\n\n")
      if (splitIndex === -1) break
      const block = buffer.slice(0, splitIndex)
      buffer = buffer.slice(splitIndex + 2)

      const lines = block.split(/\r?\n/)
      let event = "message"
      const dataLines: string[] = []
      for (const line of lines) {
        if (line.startsWith(":")) continue
        if (line.startsWith("event:")) {
          event = line.slice(6).trim() || "message"
          continue
        }
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart())
        }
      }

      if (!dataLines.length) continue
      const raw = dataLines.join("\n")
      try {
        onMessage({ event, data: JSON.parse(raw) as T })
      } catch {
        // Ignore malformed event payloads and keep stream alive.
      }
    }
  }
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

export const auth = {
  signup: (email: string, password: string, fullName: string, myroRef?: string | null) =>
    request<AuthResponse>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, full_name: fullName, myro_ref: myroRef ?? null }),
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
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
  cv_url: string | null
  cv_parsed_at: string | null
  onboarding_complete: boolean
  created_at: string
  last_active_at: string
  ninja_name: string | null
  referred_by_user_id: string | null
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
}

export interface UserSkillItem {
  key: string
  display_name: string
  level: number
  proficiency_title: string
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
  correctSkillLevel: (token: string, taxonomyKey: string, level: number) =>
    request<{ taxonomy_key: string; new_level: number; total_score: number | null }>(
      `/users/me/skills/${encodeURIComponent(taxonomyKey)}/level`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ level }),
      },
    ),
  skillLevelUpAdvice: (token: string, taxonomyKey: string, currentLevel: number, evidenceText: string, freeUnlock = false) =>
    request<{ advice: string | null; xp_spent: number; new_xp_balance: number }>(
      "/users/me/skills/level-up-advice",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ taxonomy_key: taxonomyKey, current_level: currentLevel, evidence_text: evidenceText, free_unlock: freeUnlock }),
      },
    ),
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

export interface CVUploadResponse {
  skills_detected: number
  score: number
  redirect_to: string
}

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

export const cv = {
  evidence: (token: string) =>
    request<CVEvidenceSummary>("/cv/evidence", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  structured: (token: string) =>
    request<CVStructured>("/cv/structured", {
      headers: { Authorization: `Bearer ${token}` },
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
  downloadPdf: async (token: string, cvText: string): Promise<Blob> => {
    const res = await fetch(`${BASE}/cv/download-pdf`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cv_text: cvText }),
    })
    if (!res.ok) {
      const msg = await res.text().catch(() => "PDF generation failed")
      throw new Error(msg)
    }
    return res.blob()
  },
}

export async function uploadCVText(token: string, text: string): Promise<CVUploadResponse> {
  return request<CVUploadResponse>("/cv/text", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  })
}

export async function uploadCV(token: string, file: File): Promise<CVUploadResponse> {
  const form = new FormData()
  form.append("file", file)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180_000)
  let res: Response
  try {
    res = await fetch(`${BASE}/cv/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    })
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new Error("CV processing timed out — try again")
    throw err
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      const newToken = await tryRefreshToken()
      if (newToken) {
        // Retry upload once with new token
        const retryForm = new FormData()
        retryForm.append("file", file)
        const retryRes = await fetch(`${BASE}/cv/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${newToken}` },
          body: retryForm,
        })
        if (retryRes.ok) return retryRes.json()
      }
      forceLogout()
    }
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(extractError(body, res.status))
  }
  return res.json()
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
  industry?: string | null
  remote: boolean
  overlap_score: number
  llm_rank: number | null
  llm_explanation: string | null
  batch_week: string
  source_url: string | null
  matched_skills: string[]
  job_description?: string | null
}

export interface JobMatchesResponse {
  jobs: JobMatch[]
  batch_week: string
  total: number
  feed_updated_at: string | null
  matches_computed_at: string | null
}

export interface ComputeJobMatchesResponse {
  matches_written: number
  from_cache: boolean
  exhausted?: boolean
  batch_week: string
  needs_onboarding?: boolean
  status?: JobComputeStatus
  already_running?: boolean
  job_id?: string | null
  message?: string | null
  new_xp_balance?: number | null
  xp_spent?: number
  debug?: {
    cache_hit: boolean
    user_skills_count: number | null
    candidate_jobs_count: number | null
    top_jobs_count: number | null
    target_roles_count: number | null
  } | null
}

export type JobComputeStatus = "idle" | "queued" | "running" | "succeeded" | "failed"

export interface JobComputeStatusResponse {
  user_id: string
  batch_week: string
  status: JobComputeStatus
  job_id: string | null
  already_running: boolean
  matches_written: number | null
  from_cache: boolean | null
  needs_onboarding: boolean | null
  debug: Record<string, unknown> | null
  message: string | null
  error: string | null
  new_xp_balance: number | null
  xp_spent: number
  enqueued_at: string | null
  started_at: string | null
  finished_at: string | null
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

export interface MarketAnalytics {
  total_jobs: number
  total_companies: number
  total_industries: number
  latest_batch?: string | null
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

export interface UserSkillDemandItem {
  skill: string
  display_name: string
  current_level: number
  proficiency_title: string
  target_level: number | null
  needs_upgrade: boolean
  job_count_30d: number
  weighted_demand: number
}

export interface UserSkillDemandResponse {
  skills: UserSkillDemandItem[]
  total: number
}

export const jobs = {
  searchCompanies: (q: string, limit = 10) =>
    request<string[]>(`/jobs/companies/search?q=${encodeURIComponent(q)}&limit=${limit}`),

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
  mySkillDemand: (token: string) =>
    request<UserSkillDemandResponse>("/jobs/my-skills/demand", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  matches: (token: string) =>
    request<JobMatchesResponse>("/jobs/matches", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  refresh: (token: string) =>
    request<ComputeJobMatchesResponse>("/jobs/refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  refreshStatus: (token: string) =>
    request<JobComputeStatusResponse>("/jobs/refresh/status", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  refreshStatusStream: (
    token: string,
    onStatus: (status: JobComputeStatusResponse) => void,
    signal?: AbortSignal,
  ) =>
    streamSSE<JobComputeStatusResponse>(
      "/jobs/refresh/status/stream",
      token,
      (message) => {
        if (message.event === "status") onStatus(message.data)
      },
      signal,
    ),
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
  skillGap: (token: string, jobId: string) =>
    request<SkillGapResponse>(`/jobs/${jobId}/skill-gap`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  analyseJob: (token: string, jobId: string) =>
    request<{ job_id: string; overlap_score: number; matched_count: number; total_skills: number; new_xp_balance: number }>(
      `/jobs/analyse/${jobId}`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
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

// ── XP + Forge ───────────────────────────────────────────────────────────────

export interface XPBalanceResponse {
  balance: number
}

export interface ForgeSessionResult {
  xp_earned: number
  new_xp_balance: number
  level_before: number
  level_after: number
  leveled_up: boolean
  sessions_toward_next: number
  sessions_needed: number | null
}

export interface ForgeCompletePayload {
  skill_name: string
  skill_id?: string | null
  duration_minutes: number
  session_type: "ambient" | "focused"
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

  completeForge: (token: string, payload: ForgeCompletePayload) =>
    request<ForgeSessionResult>("/users/me/forge/complete", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
}

// ── Feedback ─────────────────────────────────────────────────────────────────

export type FeedbackType = "feedback" | "company" | "bug"

export const feedback = {
  submit: (type: FeedbackType, payload: Record<string, string>, token?: string) =>
    request<{ ok: boolean; id: number }>("/feedback", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify({ type, payload }),
    }),
}

// ── Health ────────────────────────────────────────────────────────────────────

export const health = () => request<{ status: string }>("/health")
