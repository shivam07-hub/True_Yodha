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

// Deduplicates concurrent refresh calls — Supabase rotates refresh tokens on each
// use, so parallel 401s must share one refresh or the second invalidates the first.
let _refreshInFlight: Promise<string | null> | null = null

async function tryRefreshToken(): Promise<string | null> {
  if (typeof window === "undefined") return null
  if (_refreshInFlight) return _refreshInFlight
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null
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
  signup: (email: string, password: string, fullName: string) =>
    request<AuthResponse>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, full_name: fullName }),
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
}

export interface UserSkillsByDomain {
  by_domain: Record<string, UserSkillItem[]>    // L1 domain — for radar drill-down
  by_cluster: Record<string, UserSkillItem[]>   // L2 cluster — for CV page
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
    request<UserProfile>("/users/me/profile", {
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
}

// ── CV ────────────────────────────────────────────────────────────────────────

export interface CVUploadResponse {
  skills_detected: number
  score: number
  redirect_to: string
}

export interface CVHistoryItem {
  id: number
  skills_count: number
  mirror_score: number
  uploaded_at: string
  cv_raw_text: string | null
  version_number: number
  version_type: "baseline_upload" | "generated_draft"
  title: string | null
  evidence_count: number
}

export interface CVProfile {
  cv_raw_text: string | null
  cv_parsed_at: string | null
  history: CVHistoryItem[]
}

export interface CVEvidenceItem {
  skill: string
  task: string
  proof: string
  impact: string
  date: string
  confidence: number
}

export interface CVEvidenceSummary {
  eligible: boolean
  required_count: number
  evidence_count: number
  diary_entries_count: number
  skill_upgrades_count: number
  score_delta: number | null
  current_score: number | null
  last_cv_score: number | null
  next_version_number: number
  evidence: CVEvidenceItem[]
  missing_detail_prompts: string[]
}

export interface CVGenerateDraftResponse {
  version_id: number
  version_number: number
  cv_text: string
  evidence_count: number
  score_delta: number | null
}

export const cv = {
  me: (token: string) =>
    request<CVProfile>("/cv/me", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  evidence: (token: string) =>
    request<CVEvidenceSummary>("/cv/evidence", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  generateDraft: (token: string) =>
    request<CVGenerateDraftResponse>("/cv/generate-draft", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  saveDraft: (token: string, cvText: string) =>
    request<CVGenerateDraftResponse>("/cv/save-draft", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ cv_text: cvText }),
    }),
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
  action_plan: ActionPlanDay[]
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

export interface ActionPlanDay {
  day: number
  focus: string
  tasks: string[]
}

export interface ComputeJobMatchesResponse {
  matches_written: number
  from_cache: boolean
  batch_week: string
  needs_onboarding?: boolean
  status?: JobComputeStatus
  already_running?: boolean
  job_id?: string | null
  message?: string | null
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
  enqueued_at: string | null
  started_at: string | null
  finished_at: string | null
}

export type ApplicationStatus =
  | "pending"
  | "applied"
  | "no_response"
  | "responded"
  | "interviewing"
  | "rejected"
  | "offer"
  | "abandoned"

export interface ApplicationResponse {
  id: number
  job_id: string
  title: string
  company: string | null
  job_description?: string | null
  status: ApplicationStatus
  applied_at: string | null
  response_at: string | null
  checkin_sent_at: string | null
  followed_up_at?: string | null
  closed_at?: string | null
  offer_received_at?: string | null
  notes: string | null
  created_at: string
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

export interface JobCVGenerateResponse {
  id: number
  job_id: string
  cv_text: string
  polished_text: string | null
  confidence: Record<string, string | number | boolean>
  snapshot_hash: string
  from_cache: boolean
  ai_polish_used: number
  ai_polish_limit: number
  limit_reached: boolean
  polish_unavailable: boolean
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
  compute: (token: string) =>
    request<ComputeJobMatchesResponse>("/jobs/compute", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  computeStatus: (token: string) =>
    request<JobComputeStatusResponse>("/jobs/compute/status", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  computeStatusStream: (
    token: string,
    onStatus: (status: JobComputeStatusResponse) => void,
    signal?: AbortSignal,
  ) =>
    streamSSE<JobComputeStatusResponse>(
      "/jobs/compute/status/stream",
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
  skillGap: (token: string, jobId: string) =>
    request<SkillGapResponse>(`/jobs/${jobId}/skill-gap`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
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
  generateJobCv: (token: string, jobId: string, aiPolish = false) =>
    request<JobCVGenerateResponse>(`/jobs/applications/${encodeURIComponent(jobId)}/cv`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ai_polish: aiPolish }),
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
  createEntry: (token: string, entryText: string, logDate?: string) =>
    request<DiaryEntry>("/diary/entry", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ entry_text: entryText, log_date: logDate }),
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
