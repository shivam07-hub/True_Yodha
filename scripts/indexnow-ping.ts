#!/usr/bin/env tsx
/**
 * indexnow-ping.ts
 * Submits public himyro.com URLs to IndexNow (instant discovery for Bing,
 * Yandex, Seznam, Naver — and Bing's index feeds ChatGPT/Copilot retrieval).
 * Google ignores IndexNow; it costs nothing and is idempotent.
 *
 * Run AFTER the deploy is live — engines fetch the URLs you submit, so a URL
 * pinged before it resolves is wasted.
 *
 * Usage:
 *   npm run seo:indexnow                              # ping every live sitemap URL
 *   npm run seo:indexnow -- /newsletter/issue-042     # ping specific path(s)
 *   npm run seo:indexnow -- --dry-run                 # list what would be pinged
 *
 * Key contract: frontend/public/{KEY}.txt must contain exactly KEY and be
 * deployed on the host. The script verifies the live key file before pinging
 * and fails fast if it is missing or drifted.
 */

import { redactSensitiveText } from "./redact-sensitive"

const HOST = "www.himyro.com"
const KEY = "7f8c756acf23e9e679c686dfbfb0fc30"
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`
const SITEMAP_URL = `https://${HOST}/sitemap.xml`
const ENDPOINT = "https://api.indexnow.org/indexnow"
// IndexNow accepts up to 10,000 URLs per POST; stay far below it per batch.
const BATCH_SIZE = 5000

const args = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")
const pathArgs = args.filter((a) => a !== "--dry-run")

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { redirect: "follow" })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  return res.text()
}

function sitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
}

function toAbsolute(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http")) return pathOrUrl
  return `https://${HOST}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`
}

async function main(): Promise<void> {
  const urls = pathArgs.length
    ? pathArgs.map(toAbsolute)
    : sitemapLocs(await fetchText(SITEMAP_URL))

  const offHost = urls.filter((u) => !u.startsWith(`https://${HOST}/`) && u !== `https://${HOST}`)
  if (offHost.length) {
    throw new Error(`IndexNow submissions must live on ${HOST}; off-host: ${offHost.join(", ")}`)
  }
  if (!urls.length) throw new Error("No URLs to submit")

  console.log(`${urls.length} URL(s) to submit for ${HOST}`)
  if (DRY_RUN) {
    for (const u of urls) console.log(`  ${u}`)
    console.log("--dry-run: nothing submitted")
    return
  }

  // Fail fast if the key file is not live yet (e.g. before the prod deploy).
  const liveKey = (await fetchText(KEY_LOCATION)).trim()
  if (liveKey !== KEY) {
    throw new Error(`Key file drift at ${KEY_LOCATION}: expected "${KEY}", got "${liveKey}"`)
  }

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE)
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: batch }),
    })
    // 200 = submitted, 202 = accepted (key validation pending) — both fine.
    if (res.status !== 200 && res.status !== 202) {
      throw new Error(`IndexNow POST → ${res.status} ${redactSensitiveText(await res.text())}`)
    }
    console.log(`Batch ${i / BATCH_SIZE + 1}: ${batch.length} URL(s) → ${res.status}`)
  }
  console.log("Done.")
}

main().catch((err) => {
  console.error(redactSensitiveText(err instanceof Error ? err.message : err))
  process.exit(1)
})
