import test from "node:test"
import assert from "node:assert/strict"

import {
  appendAttributionToUrl,
  captureAttribution,
  readStoredAttribution,
} from "../lib/attribution"

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

const day = 24 * 60 * 60 * 1000

test("capture preserves first touch and replaces latest touch", () => {
  const storage = new MemoryStorage()
  const firstAt = new Date("2026-06-01T08:00:00Z")
  const latestAt = new Date(firstAt.getTime() + day)

  captureAttribution(
    "https://www.himyro.com/newsletter/ai?utm_source=linkedin&utm_medium=social&utm_campaign=ai-map&utm_content=founder-post",
    storage,
    firstAt,
  )
  captureAttribution(
    "https://www.himyro.com/guides/cv?utm_source=google&utm_medium=organic&utm_campaign=cv-guide",
    storage,
    latestAt,
  )

  const attribution = readStoredAttribution(storage, latestAt)
  assert.equal(attribution?.first.source, "linkedin")
  assert.equal(attribution?.first.campaign, "ai-map")
  assert.equal(attribution?.latest.source, "google")
  assert.equal(attribution?.latest.landing_path, "/guides/cv")
})

test("capture ignores pages without a usable utm_source", () => {
  const storage = new MemoryStorage()

  const result = captureAttribution(
    "https://www.himyro.com/newsletter/ai?utm_campaign=missing-source",
    storage,
    new Date("2026-06-01T08:00:00Z"),
  )

  assert.equal(result, null)
  assert.equal(readStoredAttribution(storage), null)
})

test("stored attribution expires after thirty days", () => {
  const storage = new MemoryStorage()
  const capturedAt = new Date("2026-05-01T08:00:00Z")
  captureAttribution(
    "https://www.himyro.com/?utm_source=reddit&utm_medium=community",
    storage,
    capturedAt,
  )

  assert.equal(
    readStoredAttribution(storage, new Date(capturedAt.getTime() + 31 * day)),
    null,
  )
})

test("callback URL carries acquisition across browsers", () => {
  const storage = new MemoryStorage()
  const capturedAt = new Date("2026-06-01T08:00:00Z")
  const attribution = captureAttribution(
    "https://www.himyro.com/tools/cv-score?utm_source=whatsapp&utm_medium=community&utm_campaign=campus&utm_content=group-1",
    storage,
    capturedAt,
  )

  const callback = new URL(appendAttributionToUrl(
    "https://www.himyro.com/auth/callback?next=%2Fhome",
    attribution,
  ))

  assert.equal(callback.searchParams.get("acq_source"), "whatsapp")
  assert.equal(callback.searchParams.get("acq_campaign"), "campus")
  assert.equal(callback.searchParams.get("acq_landing"), "/tools/cv-score")
  assert.equal(callback.searchParams.get("next"), "/home")
})
