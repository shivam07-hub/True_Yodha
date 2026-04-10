/**
 * Typed API client for the Mirror FastAPI backend.
 * All server state should be fetched through this file.
 * Never call fetch() directly in components — use TanStack Query + these functions.
 */

const BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  ""

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(error.detail ?? "API error")
  }
  return res.json() as Promise<T>
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  access_token: string | null
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

export const users = {
  me: (token: string) =>
    request<UserProfile>("/users/me", {
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

export async function uploadCV(token: string, file: File): Promise<CVUploadResponse> {
  const form = new FormData()
  form.append("file", file)
  const res = await fetch(`${BASE}/cv/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(error.detail ?? "Upload failed")
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
  job_id: number
  title: string
  company: string | null
  location: string | null
  remote: boolean
  overlap_score: number
  llm_rank: number | null
  llm_explanation: string | null
  action_plan: ActionPlanDay[]
  batch_week: string
  source_url: string | null
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
  job_id: number
  title: string
  company: string | null
  status: ApplicationStatus
  applied_at: string | null
  response_at: string | null
  checkin_sent_at: string | null
  notes: string | null
  created_at: string
}

export const jobs = {
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
    jobId: number,
    data: { status: ApplicationStatus; notes?: string | null; company_response?: string | null },
  ) =>
    request<ApplicationResponse>(`/jobs/applications/${jobId}`, {
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
}

// ── Skills ────────────────────────────────────────────────────────────────────

export interface Skill {
  key: string
  display_name: string
  domain: string
  level: number
}

export const skills = {
  all: () => request<Skill[]>("/skills"),
  domains: () => request<string[]>("/skills/domains"),
}

// ── Health ────────────────────────────────────────────────────────────────────

export const health = () => request<{ status: string }>("/health")
