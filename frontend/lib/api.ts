/**
 * Typed API client for the Mirror FastAPI backend.
 * All server state should be fetched through this file.
 * Never call fetch() directly in components — use TanStack Query + these functions.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? ""

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
  access_token: string
  token_type: string
  user: { id: string; email: string }
}

export const auth = {
  signup: (email: string, password: string) =>
    request<AuthResponse>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
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
  target_role: string | null
  location: string | null
}

export const users = {
  me: (token: string) =>
    request<UserProfile>("/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  updateProfile: (token: string, data: Partial<UserProfile>) =>
    request<UserProfile>("/users/me/profile", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    }),
}

// ── CV ────────────────────────────────────────────────────────────────────────

export interface CVUploadResponse {
  message: string
  skills_detected: number
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
}

export const scores = {
  compute: (token: string) =>
    request<ScoreResponse>("/scores/compute", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  me: (token: string) =>
    request<ScoreResponse>("/scores/me", {
      headers: { Authorization: `Bearer ${token}` },
    }),
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

export interface JobMatch {
  id: number
  title: string
  company: string
  overlap_score: number
  llm_rank: number
  llm_explanation: string
}

export interface JobMatchesResponse {
  jobs: JobMatch[]
}

export const jobs = {
  matches: (token: string) =>
    request<JobMatchesResponse>("/jobs/matches", {
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
