import type { FeedbackSeverity, FeedbackStatus, FeedbackType } from "@/lib/api"

export type FeedbackCategory = Extract<FeedbackType, "bug" | "idea" | "question" | "praise">

export interface CategoryMeta {
  id: FeedbackCategory
  label: string
  hint: string
  color: string
  wash: string
  placeholder: string
  submitVerb: string
  triageHint: string
}

export const CATEGORIES: Record<FeedbackCategory, CategoryMeta> = {
  bug: {
    id: "bug",
    label: "Bug",
    hint: "Something is broken or wrong",
    color: "var(--tm-warning)",
    wash: "var(--tm-warning-wash)",
    placeholder:
      "What did you expect to happen?\nWhat actually happened?\nWhat were you doing when it broke?",
    submitVerb: "Dispatch bug",
    triageHint: "median triage: 6h",
  },
  idea: {
    id: "idea",
    label: "Idea",
    hint: "A feature or improvement",
    color: "var(--tm-accent)",
    wash: "var(--tm-accent-wash)",
    placeholder:
      "What would you build?\nWho would use it?\nWhat does it unlock?",
    submitVerb: "Dispatch idea",
    triageHint: "voted weekly · top ideas ship",
  },
  question: {
    id: "question",
    label: "Question",
    hint: "How do I…?",
    color: "var(--tm-info)",
    wash: "var(--tm-info-wash)",
    placeholder: "What are you trying to do?\nWhat have you tried?",
    submitVerb: "Send question",
    triageHint: "median reply: 14h",
  },
  praise: {
    id: "praise",
    label: "Praise",
    hint: "Something that worked",
    color: "var(--tm-success)",
    wash: "var(--tm-success-wash)",
    placeholder: "What made your day?\nWhat should we do more of?",
    submitVerb: "Send praise",
    triageHint: "",
  },
}

export const CATEGORY_ORDER: FeedbackCategory[] = ["bug", "idea", "question", "praise"]

export interface SeverityMeta {
  id: FeedbackSeverity
  label: string
  desc: string
  color: string
}

export const SEVERITY: SeverityMeta[] = [
  { id: "low", label: "Low", desc: "Cosmetic", color: "var(--tm-text-muted)" },
  { id: "medium", label: "Medium", desc: "Annoying", color: "var(--tm-warning)" },
  { id: "blocker", label: "Blocker", desc: "Cannot work", color: "var(--tm-danger)" },
]

export interface StatusMeta {
  label: string
  color: string
  dot: string
}

export const STATUS_META: Record<FeedbackStatus, StatusMeta> = {
  received: { label: "Received", color: "var(--tm-text-faint)", dot: "var(--tm-text-faint)" },
  triaged: { label: "Triaged", color: "var(--tm-info)", dot: "var(--tm-info)" },
  in_progress: { label: "In progress", color: "var(--tm-accent)", dot: "var(--tm-accent)" },
  shipped: { label: "Shipped", color: "var(--tm-success)", dot: "var(--tm-success)" },
  closed: { label: "Closed", color: "var(--tm-text-muted)", dot: "var(--tm-text-muted)" },
}

export interface FeedbackSubmissionPayload {
  category: FeedbackCategory
  severity: FeedbackSeverity | null
  title: string
  body: string
  email_me: boolean
  pinned_target: string | null
  screenshots: { name: string; size: number }[]
  context: FeedbackContext
}

export interface FeedbackContext {
  url: string
  user_agent: string
  viewport: string
  accent?: string | null
}

export const OPEN_FEEDBACK_EVENT = "tm:open-feedback"

export interface OpenFeedbackDetail {
  category?: FeedbackCategory
  tab?: "new" | "reports" | "shipped"
}
