/**
 * Typed API client for the Mirror FastAPI backend.
 * All server state should be fetched through this file.
 * Never call fetch() directly in components — use TanStack Query + these functions.
 */

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

async function tryRefreshToken(): Promise<string | null> {
  if (typeof window === "undefined") return null
  const refreshToken = localStorage.getItem("mirror_refresh_token")
  if (!refreshToken) return null
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return null
    const data = await res.json() as { access_token: string; refresh_token: string }
    localStorage.setItem("mirror_token", data.access_token)
    localStorage.setItem("mirror_refresh_token", data.refresh_token)
    return data.access_token
  } catch {
    return null
  }
}

function forceLogout(): never {
  localStorage.removeItem("mirror_token")
  localStorage.removeItem("mirror_refresh_token")
  window.location.href = "/login"
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
}

export type ApplicationStatus =
  | "pending"
  | "applied"
  | "no_response"
  | "responded"
  | "interviewing"
  | "rejected"
  | "offer"

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
  notes: string | null
  created_at: string
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
}

export interface JobSearchResponse {
  jobs: JobSearchItem[]
  total: number
}

export interface MarketAnalytics {
  total_jobs: number
  total_companies: number
  total_industries: number
  latest_batch: string | null
  by_company: NameCountItem[]
  by_industry: NameCountItem[]
  top_skills: SkillCountItem[]
  company_skills: Record<string, string[]>
  industry_skills: Record<string, string[]>
}

export interface SkillGapItem {
  skill: string
  is_primary: boolean
  user_level: number | null
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

export const jobs = {
  analytics: () => request<MarketAnalytics>("/jobs/analytics"),
  search: (company: string) =>
    request<JobSearchResponse>(`/jobs/search?company=${encodeURIComponent(company)}`),
  matches: (token: string) =>
    request<JobMatchesResponse>("/jobs/matches", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  compute: (token: string) =>
    request<ComputeJobMatchesResponse>("/jobs/compute", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  applications: (token: string) =>
    request<ApplicationResponse[]>("/jobs/applications", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  updateApplication: (
    token: string,
    jobId: string,
    data: { status: ApplicationStatus; notes?: string | null; company_response?: string | null },
  ) =>
    request<ApplicationResponse>(`/jobs/applications/${jobId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    }),
  skillGap: (token: string, jobId: string) =>
    request<SkillGapResponse>(`/jobs/${jobId}/skill-gap`, {
      headers: { Authorization: `Bearer ${token}` },
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
  milestone_date: string
  skill: string | null
  task: string
  proof: string | null
  impact: string | null
  confidence: number
  completed_at: string | null
  created_at: string
  updated_at: string
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
