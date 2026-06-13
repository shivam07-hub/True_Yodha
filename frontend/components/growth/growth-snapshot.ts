import type {
  GrowthBootstrapResponse,
  LegacyGrowthPayload,
} from "@/lib/api"

function legacyKey(prefix: string, id: string, current: string | null): string {
  return current || `snapshot:${prefix}:${id}`
}

export function buildGrowthSnapshot(
  data: GrowthBootstrapResponse,
): LegacyGrowthPayload {
  return {
    assets: data.assets.map((asset) => ({
      ...asset,
      legacy_key: legacyKey("asset", asset.id, asset.legacy_key),
    })),
    campaigns: data.campaigns.map((campaign) => ({
      ...campaign,
      legacy_key: legacyKey("campaign", campaign.id, campaign.legacy_key),
    })),
    messages: data.messages.map((message) => ({
      ...message,
      legacy_key: legacyKey("message", message.id, message.legacy_key),
    })),
    publications: data.publications.map((publication) => ({
      ...publication,
      legacy_key: legacyKey(
        "publication",
        publication.id,
        publication.legacy_key,
      ),
    })),
    sweeps: data.sweeps.map((sweep) => ({
      ...sweep,
      legacy_key: legacyKey("sweep", sweep.id, sweep.legacy_key),
    })),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function numericOverride(
  value: unknown,
): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function parseGrowthSnapshot(
  text: string,
  current?: GrowthBootstrapResponse,
): LegacyGrowthPayload {
  const value: unknown = JSON.parse(text)
  if (!isRecord(value)) {
    throw new Error("Snapshot must be a JSON object.")
  }
  const keys = ["assets", "campaigns", "messages", "publications", "sweeps"]
  if (keys.every((key) => Array.isArray(value[key]))) {
    return value as unknown as LegacyGrowthPayload
  }
  if (!current) {
    throw new Error("Original tracker snapshots require current tracker data.")
  }

  const payload = buildGrowthSnapshot(current)
  const publications = payload.publications
  payload.messages = payload.messages.map((message) => {
    const metadata = isRecord(message.metadata) ? message.metadata : {}
    const trackerId = String(metadata.tracker_id || "")
    const override = trackerId && isRecord(value[trackerId])
      ? value[trackerId] as Record<string, unknown>
      : null
    if (!override) return message

    const edited = typeof override.draftEdit === "string" && override.draftEdit
      ? override.draftEdit
      : message.draft_copy
    const posted = typeof override.posted === "string" && override.posted
      ? override.posted
      : null
    const status = override.status === "posted"
      ? "published"
      : override.status === "paused"
        ? "paused"
        : "draft"
    const updated = {
      ...message,
      draft_copy: edited,
      final_copy: posted || message.final_copy,
      status,
    }

    if (status === "published") {
      const existingIndex = publications.findIndex(
        (publication) => publication.message_id === message.id,
      )
      const existing = existingIndex >= 0 ? publications[existingIndex] : {}
      const outcome = isRecord(existing.outcome) ? { ...existing.outcome } : {}
      const impressions = numericOverride(override.impressions)
      const clicks = numericOverride(override.clicks)
      if (impressions !== undefined) outcome.impressions = impressions
      if (clicks !== undefined) outcome.clicks = clicks
      const publication = {
        ...existing,
        id: existing.id || message.id,
        legacy_key:
          existing.legacy_key || `tracker:publication:${trackerId}`,
        message_id: message.id,
        status: "published",
        live_url:
          override.liveUrl || override.postedUrl || existing.live_url || null,
        final_copy_snapshot:
          posted || String(existing.final_copy_snapshot || edited),
        published_at:
          existing.published_at || message.planned_at || new Date().toISOString(),
        outcome,
      }
      if (existingIndex >= 0) publications[existingIndex] = publication
      else publications.push(publication)
    }
    return updated
  })
  return payload
}

export function downloadGrowthSnapshot(data: GrowthBootstrapResponse): void {
  const blob = new Blob([JSON.stringify(buildGrowthSnapshot(data), null, 2)], {
    type: "application/json",
  })
  const anchor = document.createElement("a")
  anchor.href = URL.createObjectURL(blob)
  anchor.download = `myro-tracker-state-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(anchor.href)
}
