import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import vm from "node:vm"

import { redactSensitiveText } from "./redact-sensitive"

type LegacyRow = Record<string, unknown>
type Overrides = Record<string, Record<string, unknown>>

export interface LegacyGrowthPayload {
  assets: LegacyRow[]
  campaigns: LegacyRow[]
  messages: LegacyRow[]
  publications: LegacyRow[]
  sweeps: LegacyRow[]
}

function extractLiteral(
  source: string,
  name: string,
  opening: "[" | "{",
  closing: "]" | "}",
): string {
  const marker = new RegExp(`\\bconst\\s+${name}\\s*=`, "m").exec(source)
  if (!marker) throw new Error(`Could not find ${name}`)
  const start = source.indexOf(opening, marker.index + marker[0].length)
  if (start < 0) throw new Error(`Could not find ${name} literal`)

  let depth = 0
  let quote: "'" | '"' | "`" | null = null
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char
      continue
    }
    if (char === opening) depth += 1
    if (char === closing) {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  throw new Error(`Unbalanced ${name} array`)
}

export function extractArrayLiteral(source: string, name: string): string {
  return extractLiteral(source, name, "[", "]")
}

export function extractObjectLiteral(source: string, name: string): string {
  return extractLiteral(source, name, "{", "}")
}

function evaluateRows(source: string, name: string): LegacyRow[] {
  const HIM = "https://www.himyro.com/newsletter/"
  const u = (slug: string, src: string, camp: string, content: string) =>
    `${HIM}${slug}?utm_source=${src}&utm_medium=social&utm_campaign=${camp}&utm_content=${content}`
  const result = vm.runInNewContext(
    `(${extractArrayLiteral(source, name)})`,
    { HIM, u, encodeURIComponent },
    { timeout: 1000 },
  )
  if (!Array.isArray(result)) throw new Error(`${name} did not evaluate to an array`)
  return result as LegacyRow[]
}

function evaluateObject(source: string, name: string): Record<string, unknown> {
  const result = vm.runInNewContext(
    `(${extractObjectLiteral(source, name)})`,
    {},
    { timeout: 1000 },
  )
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`${name} did not evaluate to an object`)
  }
  return result as Record<string, unknown>
}

function stableUuid(key: string): string {
  const bytes = Buffer.from(createHash("sha256").update(key).digest().subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function channel(value: unknown): string {
  return String(value || "other").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")
}

function slug(value: unknown): string {
  return String(value || "legacy").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
}

function newsletterSlug(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null
  try {
    const url = new URL(value)
    if (!["himyro.com", "www.himyro.com"].includes(url.hostname)) return null
    const match = url.pathname.match(/^\/newsletter\/([^/]+)/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

function composerUrl(posting: LegacyRow, copy: string): string | null {
  if (typeof posting.channel === "string") return posting.channel || null
  if (posting.platform === "X") {
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      String(posting.tweet1 || copy.slice(0, 260)),
    )}`
  }
  if (posting.platform === "LinkedIn") return "https://www.linkedin.com/feed/?shareActive=true"
  if (posting.platform === "WhatsApp") {
    return `https://wa.me/?text=${encodeURIComponent(copy)}`
  }
  return typeof posting.himyro === "string" ? posting.himyro : null
}

function normalizedStatus(value: unknown): string {
  if (value === "posted") return "published"
  if (value === "paused") return "paused"
  return "draft"
}

function manualMetric(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}

export function buildLegacyImport(
  source: string,
  overrides: Overrides = {},
): LegacyGrowthPayload {
  const issues = evaluateRows(source, "ISSUES")
  const postings = evaluateRows(source, "POSTINGS")
  const sweepRows = evaluateRows(source, "SWEEPS")
  const sweepContent = evaluateObject(source, "SWEEP_CONTENT")
  const assets: LegacyRow[] = issues.map((issue) => {
    const key = `tracker:issue:${issue.slug}`
    return {
      id: stableUuid(key),
      legacy_key: key,
      kind: "newsletter",
      title: issue.title,
      slug: issue.slug,
      summary: issue.pts,
      canonical_url: `https://www.himyro.com/newsletter/${issue.slug}`,
      status: "published",
      sensitivity: "low",
      metadata: { issue_number: issue.n },
    }
  })
  const assetBySlug = new Map(assets.map((asset) => [asset.slug, asset]))
  const fallbackKey = "tracker:asset:distribution-operations"
  const fallbackAsset = {
    id: stableUuid(fallbackKey),
    legacy_key: fallbackKey,
    kind: "community_response",
    title: "Legacy distribution operations",
    summary: "Community responses and channel work imported from the standalone tracker.",
    status: "published",
    sensitivity: "medium",
    metadata: { source: "distribution-tracker.html" },
  }
  assets.push(fallbackAsset)

  const campaigns = new Map<string, LegacyRow>()
  const messages: LegacyRow[] = []
  const publications: LegacyRow[] = []
  for (const posting of postings) {
    const postingId = String(posting.id)
    const override = overrides[postingId] ?? {}
    const sourceUrl = typeof posting.himyro === "string" ? posting.himyro : ""
    const linkedAsset = assetBySlug.get(newsletterSlug(sourceUrl)) ?? fallbackAsset
    const campaignSlug = String(posting.campaign || "legacy-tracker")
    const campaignKey = `tracker:campaign:${campaignSlug}`
    const campaignId = stableUuid(campaignKey)
    const effectiveStatus = normalizedStatus(override.status ?? posting.status)
    const draft = String(
      override.draftEdit || posting.copy || posting.tweet1 || "",
    )
    const preparedDraft = String(posting.copy || posting.tweet1 || "")
    const finalCopy = String(override.posted ?? posting.posted ?? "") || null
    const messageKey = `tracker:posting:${postingId}`
    const messageId = stableUuid(messageKey)

    if (!campaigns.has(campaignKey)) {
      campaigns.set(campaignKey, {
        id: campaignId,
        legacy_key: campaignKey,
        asset_id: linkedAsset.id,
        slug: slug(campaignSlug),
        name: `${posting.title || campaignSlug} distribution`,
        objective: "Help the right job seeker with evidence-led career guidance.",
        status: "active",
        planned_at: `${posting.date}T09:00:00Z`,
        metadata: { source_campaign: campaignSlug },
      })
    }
    messages.push({
      id: messageId,
      legacy_key: messageKey,
      campaign_id: campaignId,
      asset_id: linkedAsset.id,
      channel: channel(posting.platform),
      format: String(posting.type || "Post").toLowerCase(),
      variant: postingId,
      intent: posting.type === "Response" ? "helpful_response" : "distribution",
      draft_copy: draft,
      final_copy: finalCopy,
      call_to_action_url: sourceUrl || null,
      utm_url: sourceUrl.includes("utm_") ? sourceUrl : null,
      composer_url: composerUrl(posting, draft),
      status: effectiveStatus,
      automation_level: "manual",
      sensitivity: posting.type === "Response" ? "medium" : "low",
      planned_at: `${posting.date}T09:00:00Z`,
      metadata: {
        tracker_title: posting.title,
        tracker_id: postingId,
        prepared_draft: preparedDraft,
      },
    })
    if (effectiveStatus === "published") {
      const publicationKey = `tracker:publication:${postingId}`
      const finalCopySnapshot = finalCopy || draft
      const outcome: Record<string, number> = {}
      const impressions = manualMetric(override.impressions)
      const clicks = manualMetric(override.clicks)
      if (impressions !== undefined) outcome.impressions = impressions
      if (clicks !== undefined) outcome.clicks = clicks
      publications.push({
        id: stableUuid(publicationKey),
        legacy_key: publicationKey,
        message_id: messageId,
        status: "published",
        live_url: override.liveUrl || override.postedUrl || null,
        final_copy_snapshot: finalCopySnapshot,
        published_at: `${posting.date}T12:00:00Z`,
        outcome,
        failure_details: override.liveUrl
          ? null
          : "Legacy tracker marked this published without a captured live URL.",
      })
    }
  }
  const sweeps = sweepRows.map((sweep) => {
    const key = String(sweep.key)
    const legacyKey = `tracker:sweep:${key}`
    return {
      id: stableUuid(legacyKey),
      legacy_key: legacyKey,
      sweep_date: sweep.date,
      title: `Myro Seeding Sweep - ${sweep.date}`,
      summary: sweep.pts || null,
      body: String(sweepContent[key] || ""),
      metadata: { tracker_key: key },
    }
  })
  return {
    assets,
    campaigns: Array.from(campaigns.values()),
    messages,
    publications,
    sweeps,
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const valueAfter = (flag: string) => {
    const index = args.indexOf(flag)
    return index >= 0 ? args[index + 1] : undefined
  }
  const trackerPath = resolve(
    valueAfter("--file") ?? resolve(root, "Myro Newsletter/growth-agent/distribution-tracker.html"),
  )
  const statePath = valueAfter("--state")
  const source = await readFile(trackerPath, "utf8")
  const overrides = statePath
    ? JSON.parse(await readFile(resolve(statePath), "utf8")) as Overrides
    : {}
  const payload = buildLegacyImport(source, overrides)
  const counts = Object.fromEntries(
    Object.entries(payload).map(([key, rows]) => [key, rows.length]),
  )
  if (args.includes("--dry-run")) {
    console.log(JSON.stringify({ dry_run: true, trackerPath, counts }, null, 2))
    return
  }
  const token = process.env.MYRO_GROWTH_ACCESS_TOKEN
  if (!token) throw new Error("MYRO_GROWTH_ACCESS_TOKEN is required for live import")
  const api = process.env.MYRO_API_URL ?? "https://api.himyro.com"
  const response = await fetch(`${api}/growth/import/legacy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(`Import failed (${response.status}): ${redactSensitiveText(await response.text())}`)
  }
  console.log(JSON.stringify(await response.json(), null, 2))
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(redactSensitiveText(error instanceof Error ? error.message : error))
    process.exitCode = 1
  })
}
