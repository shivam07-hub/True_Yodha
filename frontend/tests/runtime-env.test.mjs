import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import { validateProductionEnv } from "../runtime-env.mjs"

const validProductionEnv = {
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "publishable-key",
  NEXT_PUBLIC_API_URL: "https://api.himyro.com",
  NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_live_public",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-key",
  NEXT_PUBLIC_SITE_URL: "https://himyro.com",
  API_INTERNAL_URL: "https://api.himyro.com",
}

test("production frontend configuration rejects missing critical values", () => {
  assert.throws(
    () => validateProductionEnv({ NODE_ENV: "production" }),
    /NEXT_PUBLIC_SUPABASE_URL/,
  )
})

test("Vercel preview accepts the Turnstile test-key fallback", () => {
  validateProductionEnv({
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "publishable-key",
    NEXT_PUBLIC_API_URL: "https://truemirror.up.railway.app",
    NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_test_public",
  })
})

test("production accepts the internal API fallback", () => {
  validateProductionEnv({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "publishable-key",
    NEXT_PUBLIC_API_URL: "https://api.himyro.com",
    NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_live_public",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-key",
    NEXT_PUBLIC_SITE_URL: "https://himyro.com",
  })
})

test("production startup command runs environment validation", () => {
  const result = spawnSync(
    process.execPath,
    [new URL("../scripts/validate-runtime-env.mjs", import.meta.url).pathname],
    {
      cwd: "/tmp",
      env: { NODE_ENV: "production" },
      encoding: "utf8",
    },
  )

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /NEXT_PUBLIC_SUPABASE_URL/)
})

test("production frontend configuration rejects insecure service URLs", () => {
  assert.throws(
    () =>
      validateProductionEnv({
        ...validProductionEnv,
        NEXT_PUBLIC_API_URL: "http://api.himyro.com",
      }),
    /NEXT_PUBLIC_API_URL must use HTTPS/,
  )
})

test("production frontend configuration rejects example placeholders", () => {
  assert.throws(
    () =>
      validateProductionEnv({
        ...validProductionEnv,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "your-supabase-anon-key",
      }),
    /NEXT_PUBLIC_SUPABASE_ANON_KEY.*placeholder/,
  )
})

test("frontend env example documents every application environment read", () => {
  const frontendRoot = new URL("..", import.meta.url)
  const documented = new Set(
    readFileSync(new URL(".env.example", frontendRoot), "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => line.split("=", 1)[0]),
  )
  const referenced = new Set()
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".next" || entry.name === "node_modules") continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(path)
      } else if (/\.(?:js|mjs|ts|tsx)$/.test(entry.name)) {
        const source = readFileSync(path, "utf8")
        for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) {
          referenced.add(match[1])
        }
      }
    }
  }
  visit(frontendRoot.pathname)
  referenced.delete("NODE_ENV")
  referenced.delete("VERCEL_URL")

  assert.deepEqual([...referenced].filter((name) => !documented.has(name)), [])
})
