const STORAGE_KEY = "myro_acquisition_v1"
const TTL_MS = 30 * 24 * 60 * 60 * 1000
const SOURCE_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface AcquisitionTouch {
  source: string
  medium: string | null
  campaign: string | null
  content: string | null
  term: string | null
  landing_path: string
  captured_at: string
}

export interface AcquisitionAttribution {
  first: AcquisitionTouch
  latest: AcquisitionTouch
}

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function clean(value: string | null, max = 160): string | null {
  const normalized = value?.trim().slice(0, max)
  return normalized || null
}

function parseTouch(rawUrl: string, now: Date): AcquisitionTouch | null {
  const url = new URL(rawUrl, "https://www.himyro.com")
  const source = clean(url.searchParams.get("utm_source"), 80)?.toLowerCase() ?? null
  if (!source || !SOURCE_RE.test(source)) return null

  return {
    source,
    medium: clean(url.searchParams.get("utm_medium"), 80)?.toLowerCase() ?? null,
    campaign: clean(url.searchParams.get("utm_campaign")),
    content: clean(url.searchParams.get("utm_content")),
    term: clean(url.searchParams.get("utm_term")),
    landing_path: url.pathname,
    captured_at: now.toISOString(),
  }
}

function isFresh(attribution: AcquisitionAttribution, now: Date): boolean {
  const capturedAt = Date.parse(attribution.first.captured_at)
  return Number.isFinite(capturedAt) && now.getTime() - capturedAt <= TTL_MS
}

export function readStoredAttribution(
  storage: StorageLike | null = browserStorage(),
  now = new Date(),
): AcquisitionAttribution | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AcquisitionAttribution
    if (!parsed.first?.source || !parsed.latest?.source || !isFresh(parsed, now)) {
      storage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    storage.removeItem(STORAGE_KEY)
    return null
  }
}

export function captureAttribution(
  rawUrl: string,
  storage: StorageLike | null = browserStorage(),
  now = new Date(),
): AcquisitionAttribution | null {
  if (!storage) return null
  const touch = parseTouch(rawUrl, now)
  if (!touch) return readStoredAttribution(storage, now)
  const current = readStoredAttribution(storage, now)
  const attribution = { first: current?.first ?? touch, latest: touch }
  storage.setItem(STORAGE_KEY, JSON.stringify(attribution))
  return attribution
}

export function captureAttributionFromCallback(
  rawUrl: string,
  storage: StorageLike | null = browserStorage(),
): AcquisitionAttribution | null {
  const url = new URL(rawUrl)
  const source = url.searchParams.get("acq_source")
  if (!source) return readStoredAttribution(storage)
  const params = new URLSearchParams({
    utm_source: source,
    utm_medium: url.searchParams.get("acq_medium") ?? "",
    utm_campaign: url.searchParams.get("acq_campaign") ?? "",
    utm_content: url.searchParams.get("acq_content") ?? "",
    utm_term: url.searchParams.get("acq_term") ?? "",
  })
  const landing = url.searchParams.get("acq_landing") || "/"
  return captureAttribution(`https://www.himyro.com${landing}?${params}`, storage)
}

export function appendAttributionToUrl(
  rawUrl: string,
  attribution: AcquisitionAttribution | null = readStoredAttribution(),
): string {
  if (!attribution) return rawUrl
  const url = new URL(rawUrl)
  const touch = attribution.latest
  url.searchParams.set("acq_source", touch.source)
  if (touch.medium) url.searchParams.set("acq_medium", touch.medium)
  if (touch.campaign) url.searchParams.set("acq_campaign", touch.campaign)
  if (touch.content) url.searchParams.set("acq_content", touch.content)
  if (touch.term) url.searchParams.set("acq_term", touch.term)
  url.searchParams.set("acq_landing", touch.landing_path)
  return url.toString()
}

export function capturePendingAttribution(): AcquisitionAttribution | null {
  return typeof window === "undefined" ? null : captureAttribution(window.location.href)
}

export function clearStoredAttribution(storage: StorageLike | null = browserStorage()): void {
  storage?.removeItem(STORAGE_KEY)
}
