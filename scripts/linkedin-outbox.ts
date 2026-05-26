#!/usr/bin/env tsx
/**
 * linkedin-outbox.ts
 * Shared parser + validation for growth-agent LinkedIn outbox drafts.
 */

import fs from "fs"
import path from "path"

export type OutboxStatus = "draft" | "review-ready" | "scheduled" | "published" | "paused"

export interface LinkedInOutboxPost {
  filePath: string
  fileName: string
  channel: string
  publishTime: Date
  publishTimeRaw: string
  reviewDeadline: Date
  reviewDeadlineRaw: string
  status: OutboxStatus
  ctaUrl: string
  utmSource: string
  utmMedium: string
  utmCampaign: string
  utmContent: string
  sourceClaim: string
  copy: string
  reviewWindowHours: number
  linkedinPostUrn?: string
  publishedAt?: string
  content: string
}

const REPO_ROOT = path.resolve(__dirname, "..")
export const OUTBOX_DIR = path.resolve(REPO_ROOT, "Myro Newsletter", "growth-agent", "outbox")

const ALLOWED_STATUSES = new Set<OutboxStatus>(["draft", "review-ready", "scheduled", "published", "paused"])

const FIELD_ALIASES: Record<string, string> = {
  "channel": "channel",
  "publish time": "publish_time",
  "review deadline": "review_deadline",
  "status": "status",
  "cta url": "cta_url",
  "utm source": "utm_source",
  "utm medium": "utm_medium",
  "utm campaign": "utm_campaign",
  "utm content": "utm_content",
  "source claim": "source_claim",
  "copy": "copy",
  "review window hours": "review_window_hours",
  "published at": "published_at",
  "linkedin post urn": "linkedin_post_urn",
}

const REQUIRED_FIELDS = [
  "channel",
  "publish_time",
  "review_deadline",
  "status",
  "cta_url",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "source_claim",
  "copy",
] as const

const TWENTY_FOUR_HOUR_TERMS = [
  "launch",
  "fellowship",
  "company-status",
  "company status",
  "prize",
  "certificate",
  "leaderboard",
  "layoff",
  "job loss",
]

function normalizeFieldName(raw: string): string | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ")
  return FIELD_ALIASES[key] ?? null
}

function parseFields(content: string): Record<string, string> {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const parsed: Record<string, string> = {}
  let currentKey: string | null = null

  for (const line of lines) {
    const match = line.match(/^([A-Za-z][A-Za-z ]+):\s*(.*)$/)
    if (match) {
      const canonical = normalizeFieldName(match[1])
      if (canonical) {
        currentKey = canonical
        parsed[currentKey] = match[2]
        continue
      }
    }

    if (currentKey) {
      parsed[currentKey] = `${parsed[currentKey]}\n${line}`
    }
  }

  for (const [k, v] of Object.entries(parsed)) {
    parsed[k] = v.trim()
  }

  return parsed
}

function parseDate(raw: string, label: string, filePath: string): Date {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${path.basename(filePath)}: invalid ${label} ("${raw}"). Use an ISO-like datetime with timezone.`)
  }
  return d
}

function parseStatus(raw: string, filePath: string): OutboxStatus {
  const status = raw.trim().toLowerCase() as OutboxStatus
  if (!ALLOWED_STATUSES.has(status)) {
    throw new Error(`${path.basename(filePath)}: unsupported status "${raw}".`)
  }
  return status
}

function inferReviewWindowHours(sourceClaim: string, copy: string): number {
  const haystack = `${sourceClaim}\n${copy}`.toLowerCase()
  return TWENTY_FOUR_HOUR_TERMS.some(t => haystack.includes(t)) ? 24 : 2
}

function parseReviewWindowHours(raw: string | undefined, fallback: number, filePath: string): number {
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${path.basename(filePath)}: Review window hours must be a positive number.`)
  }
  return value
}

function requireField(fields: Record<string, string>, key: (typeof REQUIRED_FIELDS)[number], filePath: string): string {
  const value = fields[key]
  if (!value || !value.trim()) {
    throw new Error(`${path.basename(filePath)}: missing required field "${key}".`)
  }
  return value.trim()
}

function assertUtmCtaAlignment(post: LinkedInOutboxPost): void {
  const cta = new URL(post.ctaUrl)

  const expectations: Array<[string, string]> = [
    ["utm_source", post.utmSource],
    ["utm_medium", post.utmMedium],
    ["utm_campaign", post.utmCampaign],
    ["utm_content", post.utmContent],
  ]

  for (const [param, expected] of expectations) {
    const actual = cta.searchParams.get(param)
    if (actual !== expected) {
      throw new Error(
        `${post.fileName}: CTA URL ${param}="${actual ?? ""}" must match field value "${expected}".`,
      )
    }
  }
}

export function parseLinkedInOutboxFile(filePath: string): LinkedInOutboxPost {
  const content = fs.readFileSync(filePath, "utf8")
  const fields = parseFields(content)

  const channel = requireField(fields, "channel", filePath).toLowerCase()
  const publishTimeRaw = requireField(fields, "publish_time", filePath)
  const reviewDeadlineRaw = requireField(fields, "review_deadline", filePath)
  const status = parseStatus(requireField(fields, "status", filePath), filePath)
  const ctaUrl = requireField(fields, "cta_url", filePath)
  const utmSource = requireField(fields, "utm_source", filePath)
  const utmMedium = requireField(fields, "utm_medium", filePath)
  const utmCampaign = requireField(fields, "utm_campaign", filePath)
  const utmContent = requireField(fields, "utm_content", filePath)
  const sourceClaim = requireField(fields, "source_claim", filePath)
  const copy = requireField(fields, "copy", filePath)

  let parsedCta: URL
  try {
    parsedCta = new URL(ctaUrl)
  } catch {
    throw new Error(`${path.basename(filePath)}: CTA URL is not a valid absolute URL.`)
  }

  const inferredWindow = inferReviewWindowHours(sourceClaim, copy)
  const reviewWindowHours = parseReviewWindowHours(fields.review_window_hours, inferredWindow, filePath)

  const post: LinkedInOutboxPost = {
    filePath,
    fileName: path.basename(filePath),
    channel,
    publishTimeRaw,
    publishTime: parseDate(publishTimeRaw, "publish time", filePath),
    reviewDeadlineRaw,
    reviewDeadline: parseDate(reviewDeadlineRaw, "review deadline", filePath),
    status,
    ctaUrl: parsedCta.toString(),
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    sourceClaim,
    copy,
    reviewWindowHours,
    linkedinPostUrn: fields.linkedin_post_urn,
    publishedAt: fields.published_at,
    content,
  }

  assertUtmCtaAlignment(post)

  if (!post.copy.includes(post.ctaUrl)) {
    throw new Error(`${post.fileName}: Copy must include the exact CTA URL so distribution and attribution stay aligned.`)
  }

  const reviewLeadMs = post.publishTime.getTime() - post.reviewDeadline.getTime()
  const requiredLeadMs = post.reviewWindowHours * 60 * 60 * 1000
  if (reviewLeadMs < requiredLeadMs) {
    throw new Error(
      `${post.fileName}: review lead (${(reviewLeadMs / 3600000).toFixed(2)}h) is below required ${post.reviewWindowHours}h window.`,
    )
  }

  if (post.reviewDeadline.getTime() > post.publishTime.getTime()) {
    throw new Error(`${post.fileName}: review deadline must be before publish time.`)
  }

  return post
}

export function loadLinkedInOutboxPosts(dir = OUTBOX_DIR): LinkedInOutboxPost[] {
  if (!fs.existsSync(dir)) return []

  const files = fs
    .readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith(".md") && !f.startsWith("README"))
    .map(f => path.join(dir, f))
    .sort((a, b) => a.localeCompare(b))

  const posts: LinkedInOutboxPost[] = []
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8")
    const channelMatch = content.match(/^Channel:\\s*(.+)$/im)
    if (!channelMatch) continue
    if (channelMatch[1].trim().toLowerCase() !== "linkedin") continue

    const parsed = parseLinkedInOutboxFile(filePath)
    posts.push(parsed)
  }
  return posts
}

export function markPostPublished(filePath: string, postUrn: string, publishedAtIso: string): void {
  let content = fs.readFileSync(filePath, "utf8")

  if (/^Status:\s*/m.test(content)) {
    content = content.replace(/^Status:\s*.*$/m, "Status: published")
  }

  if (/^LinkedIn post URN:\s*/mi.test(content)) {
    content = content.replace(/^LinkedIn post URN:\s*.*$/mi, `LinkedIn post URN: ${postUrn}`)
  } else {
    content = `${content.trimEnd()}\nLinkedIn post URN: ${postUrn}\n`
  }

  if (/^Published at:\s*/mi.test(content)) {
    content = content.replace(/^Published at:\s*.*$/mi, `Published at: ${publishedAtIso}`)
  } else {
    content = `${content.trimEnd()}\nPublished at: ${publishedAtIso}\n`
  }

  fs.writeFileSync(filePath, content, "utf8")
}
