import assert from "node:assert/strict"
import test from "node:test"

import { ApiError } from "../lib/api-error"
import { publicApiConnectOrigins, publicApiHost, publicRead } from "../lib/public-api"
import { buildContentSecurityPolicy } from "../lib/security-policy"

const railway = "https://mirror-backend-prod-production.up.railway.app"
const publicAlias = "https://api.himyro.com"

const splitEnv = {
  NEXT_PUBLIC_API_BASE_URL: railway,
  NEXT_PUBLIC_API_URL: publicAlias,
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

test("the fetch host prefers BASE_URL so it matches connect-src's first origin", () => {
  assert.equal(publicApiHost(splitEnv), railway)
  assert.equal(publicApiHost({ NEXT_PUBLIC_API_URL: publicAlias }), publicAlias)
  assert.deepEqual(publicApiConnectOrigins(splitEnv), [railway, publicAlias])
})

test("CSP built from the public-read hosts admits both configured origins", () => {
  const policy = buildContentSecurityPolicy({
    nonce: "n",
    apiUrl: publicApiHost(splitEnv),
    extraApiUrls: publicApiConnectOrigins(splitEnv),
    production: true,
  })
  assert.match(policy, /connect-src[^;]*https:\/\/mirror-backend-prod-production\.up\.railway\.app/)
  assert.match(policy, /connect-src[^;]*https:\/\/api\.himyro\.com/)
})

test("a successful read hits the fetch host, not the unused alias", async () => {
  let url = ""
  const result = await publicRead<{ ok: boolean }>(
    "/companies/Amex/skill-intelligence",
    {},
    {
      env: splitEnv,
      fetch: async input => {
        url = String(input)
        return jsonResponse({ ok: true })
      },
    },
  )
  assert.equal(url, `${railway}/companies/Amex/skill-intelligence`)
  assert.deepEqual(result, { ok: true })
})

test("missing empty turns a 404 into null instead of an error", async () => {
  const result = await publicRead(
    "/companies/Ghost",
    { missing: "empty" },
    {
      env: splitEnv,
      fetch: async () => new Response("absent", { status: 404 }),
    },
  )
  assert.equal(result, null)
})

test("a 404 without missing empty is a non-retryable http error", async () => {
  await assert.rejects(
    () =>
      publicRead("/x", {}, {
        env: splitEnv,
        fetch: async () => new Response("absent", { status: 404 }),
      }),
    (err: unknown) =>
      err instanceof ApiError && err.status === 404 && err.retryable === false,
  )
})

test("a 500 is a retryable http error", async () => {
  await assert.rejects(
    () =>
      publicRead("/x", {}, {
        env: splitEnv,
        fetch: async () => jsonResponse({ detail: "boom" }, 500),
      }),
    (err: unknown) =>
      err instanceof ApiError && err.status === 500 && err.retryable === true,
  )
})

test("an abort is a timeout the caller can retry", async () => {
  await assert.rejects(
    () =>
      publicRead("/x", { timeoutMs: 20 }, {
        env: splitEnv,
        fetch: (_input, init) =>
          new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Timeout", "AbortError"))
            })
          }),
      }),
    (err: unknown) => err instanceof ApiError && err.kind === "timeout" && err.retryable,
  )
})
