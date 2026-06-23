#!/usr/bin/env tsx
/**
 * linkedin-auth-setup.ts
 *
 * One-shot helper to obtain the LinkedIn credentials the outbox publisher needs:
 *   - LINKEDIN_REFRESH_TOKEN  (60-day refresh token, auto-renews access tokens)
 *   - LINKEDIN_ORGANIZATION_URN  (urn:li:organization:<id> you administer)
 *
 * It runs the 3-legged OAuth flow locally:
 *   1. Opens your browser to LinkedIn's consent screen.
 *   2. Captures the redirect on http://localhost:5599/callback.
 *   3. Exchanges the code for an access_token + refresh_token.
 *   4. Looks up the organizations you ADMIN and prints their URNs.
 *   5. Appends the results to scripts/.env.linkedin (git-ignored).
 *
 * Prereqs (manual, only you can do):
 *   - A LinkedIn developer app with the "Community Management API" product approved.
 *   - That app's Auth tab must list this exact redirect URL:
 *         http://localhost:5599/callback
 *   - Export the app's client id/secret before running, e.g.:
 *         LINKEDIN_CLIENT_ID=xxxx LINKEDIN_CLIENT_SECRET=yyyy npx tsx scripts/linkedin-auth-setup.ts
 *     (or put them in scripts/.env.linkedin first)
 */

import http from "node:http"
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_FILE = path.join(__dirname, ".env.linkedin")
const PORT = 5599
const REDIRECT_URI = `http://localhost:${PORT}/callback`

// Scopes: post to org pages + read which orgs you administer.
const SCOPES = ["w_organization_social", "r_organization_admin"]

function loadEnvFile(): Record<string, string> {
  if (!fs.existsSync(ENV_FILE)) return {}
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
  return out
}

function requireCred(name: string, fileEnv: Record<string, string>): string {
  const v = (process.env[name] ?? fileEnv[name] ?? "").trim()
  if (!v) {
    console.error(
      `\nMissing ${name}. Set it via env or scripts/.env.linkedin, e.g.:\n` +
        `  LINKEDIN_CLIENT_ID=xxx LINKEDIN_CLIENT_SECRET=yyy npx tsx scripts/linkedin-auth-setup.ts\n`,
    )
    process.exit(1)
  }
  return v
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
  spawn(cmd, [url], { stdio: "ignore", detached: true }).unref()
}

function appendEnv(updates: Record<string, string>): void {
  const existing = loadEnvFile()
  const merged = { ...existing, ...updates }
  const body =
    "# LinkedIn outbox publisher credentials — DO NOT COMMIT\n" +
    Object.entries(merged)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") +
    "\n"
  fs.writeFileSync(ENV_FILE, body, { mode: 0o600 })
}

async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    client_secret: clientSecret,
  })
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  })
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${(await res.text()).slice(0, 800)}`)
  }
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }
}

function apiVersion(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`
}

async function lookupAdminOrgs(accessToken: string): Promise<string[]> {
  const url =
    "https://api.linkedin.com/rest/organizationAcls" +
    "?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=50"
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "Linkedin-Version": apiVersion(),
    },
  })
  if (!res.ok) {
    console.warn(
      `\n(Could not auto-list admin orgs: ${res.status} ${(await res.text()).slice(0, 300)})\n` +
        `You can set LINKEDIN_ORGANIZATION_URN manually as urn:li:organization:<id>.`,
    )
    return []
  }
  const json = (await res.json()) as { elements?: Array<{ organization?: string }> }
  return (json.elements ?? []).map(e => e.organization).filter((x): x is string => !!x)
}

async function main(): Promise<void> {
  const fileEnv = loadEnvFile()
  const clientId = requireCred("LINKEDIN_CLIENT_ID", fileEnv)
  const clientSecret = requireCred("LINKEDIN_CLIENT_SECRET", fileEnv)

  const state = Math.random().toString(36).slice(2)
  const authUrl =
    "https://www.linkedin.com/oauth/v2/authorization?" +
    new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      state,
      scope: SCOPES.join(" "),
    }).toString()

  const code: string = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url ?? "", `http://localhost:${PORT}`)
      if (u.pathname !== "/callback") {
        res.writeHead(404).end("not found")
        return
      }
      const err = u.searchParams.get("error")
      if (err) {
        res.writeHead(400).end(`LinkedIn error: ${err} — ${u.searchParams.get("error_description")}`)
        server.close()
        reject(new Error(`${err}: ${u.searchParams.get("error_description")}`))
        return
      }
      if (u.searchParams.get("state") !== state) {
        res.writeHead(400).end("state mismatch")
        server.close()
        reject(new Error("OAuth state mismatch"))
        return
      }
      const gotCode = u.searchParams.get("code")
      res.writeHead(200, { "Content-Type": "text/html" }).end(
        "<h2>LinkedIn connected.</h2><p>You can close this tab and return to the terminal.</p>",
      )
      server.close()
      if (gotCode) resolve(gotCode)
      else reject(new Error("No code in callback"))
    })
    server.listen(PORT, () => {
      console.log(`\nOpening browser for LinkedIn consent...`)
      console.log(`If it doesn't open, paste this URL:\n${authUrl}\n`)
      openBrowser(authUrl)
    })
  })

  console.log("Exchanging authorization code for tokens...")
  const tokens = await exchangeCode(code, clientId, clientSecret)
  if (!tokens.refresh_token) {
    console.warn(
      "\nWARNING: LinkedIn did not return a refresh_token. This means the app is not approved\n" +
        "for the Community Management API (refresh tokens are only issued to approved apps).\n" +
        "Saving the access_token, but the GitHub Action needs a refresh_token to run unattended.\n",
    )
  }

  const orgs = await lookupAdminOrgs(tokens.access_token)

  const updates: Record<string, string> = {
    LINKEDIN_CLIENT_ID: clientId,
    LINKEDIN_CLIENT_SECRET: clientSecret,
  }
  if (tokens.refresh_token) updates.LINKEDIN_REFRESH_TOKEN = tokens.refresh_token
  if (orgs.length === 1) updates.LINKEDIN_ORGANIZATION_URN = orgs[0]
  appendEnv(updates)

  console.log("\n==== RESULT ====")
  console.log(`refresh_token: ${tokens.refresh_token ? "captured (ok)" : "MISSING (app not approved)"}`)
  if (orgs.length === 0) {
    console.log("admin orgs: none found — set LINKEDIN_ORGANIZATION_URN manually.")
  } else if (orgs.length === 1) {
    console.log(`organization URN: ${orgs[0]} (saved)`)
  } else {
    console.log("You administer multiple orgs — pick the Myro page and add it to scripts/.env.linkedin:")
    for (const o of orgs) console.log(`  LINKEDIN_ORGANIZATION_URN=${o}`)
  }
  console.log(`\nSaved to ${ENV_FILE}`)
  console.log("Next: run  bash scripts/set-linkedin-secrets.sh  to push these to GitHub.\n")
}

main().catch(e => {
  console.error("\nFailed:", e instanceof Error ? e.message : e)
  process.exit(1)
})
