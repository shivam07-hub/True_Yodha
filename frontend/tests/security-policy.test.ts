import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import test from "node:test"
import { join } from "node:path"

import {
  buildContentSecurityPolicy,
  buildNewsletterChartPolicy,
  CHART_INLINE_SCRIPT_HASHES,
  STATIC_SECURITY_HEADERS,
} from "../lib/security-policy"

test("connect-src admits every public API host the client might call", () => {
  const policy = buildContentSecurityPolicy({
    nonce: "nonce-value",
    apiUrl: "https://mirror-backend-prod-production.up.railway.app",
    extraApiUrls: ["https://api.himyro.com"],
    supabaseUrl: "https://project.supabase.co",
    production: true,
  })

  assert.match(
    policy,
    /connect-src[^;]*https:\/\/mirror-backend-prod-production\.up\.railway\.app/,
  )
  assert.match(policy, /connect-src[^;]*https:\/\/api\.himyro\.com/)
})

test("security policy permits only app scripts and required payment/challenge providers", () => {
  const policy = buildContentSecurityPolicy({
    nonce: "nonce-value",
    apiUrl: "https://api.himyro.com",
    supabaseUrl: "https://project.supabase.co",
    production: true,
  })

  assert.match(
    policy,
    /script-src 'self' 'nonce-nonce-value' 'strict-dynamic' https:\/\/checkout\.razorpay\.com https:\/\/challenges\.cloudflare\.com/,
  )
  assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/)
  assert.match(policy, /frame-ancestors 'none'/)
  assert.match(policy, /upgrade-insecure-requests/)
})

test("middleware installs public-read hosts into connect-src", () => {
  const middleware = readFileSync(
    new URL("../middleware.ts", import.meta.url),
    "utf8",
  )
  assert.match(middleware, /publicApiHost/)
  assert.match(middleware, /publicApiConnectOrigins/)
})

test("static security headers include the complete prelaunch baseline", () => {
  assert.equal(STATIC_SECURITY_HEADERS["X-Content-Type-Options"], "nosniff")
  assert.equal(STATIC_SECURITY_HEADERS["X-Frame-Options"], "DENY")
  assert.equal(
    STATIC_SECURITY_HEADERS["Strict-Transport-Security"],
    "max-age=31536000; includeSubDomains",
  )
})

test("newsletter chart inline scripts remain locked to reviewed hashes", () => {
  const chartsDirectory = join(process.cwd(), "public/newsletter/charts")
  const chartFiles = readdirSync(chartsDirectory).filter((name) =>
    name.endsWith(".html"),
  )
  const actualHashes = chartFiles
    .flatMap((name) => {
      const source = readFileSync(join(chartsDirectory, name), "utf8")
      return Array.from(
        source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi),
        (match) =>
          `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`,
      )
    })
    .sort()

  assert.deepEqual(actualHashes, [...CHART_INLINE_SCRIPT_HASHES].sort())
  for (const name of chartFiles) {
    assert.equal(
      existsSync(join(chartsDirectory, name.replace(/\.html$/, ".png"))),
      true,
    )
  }
  assert.match(buildNewsletterChartPolicy(true), /frame-ancestors 'none'/)
})
