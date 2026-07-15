#!/usr/bin/env tsx
/**
 * linkedin-client.ts
 * Minimal LinkedIn Marketing API client for organization page posting.
 */

import { redactSensitiveText } from "./redact-sensitive"

interface LinkedInAuthResponse {
  access_token: string
  expires_in: number
}

export interface PublishPostInput {
  authorUrn: string
  commentary: string
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function resolveLinkedInVersion(): string {
  const envValue = process.env.LINKEDIN_API_VERSION?.trim()
  if (envValue) return envValue

  const now = new Date()
  const year = now.getUTCFullYear().toString()
  const month = String(now.getUTCMonth() + 1).padStart(2, "0")
  return `${year}${month}`
}

export async function fetchLinkedInAccessToken(): Promise<string> {
  const clientId = requireEnv("LINKEDIN_CLIENT_ID")
  const clientSecret = requireEnv("LINKEDIN_CLIENT_SECRET")
  const refreshToken = requireEnv("LINKEDIN_REFRESH_TOKEN")

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`LinkedIn token refresh failed (${response.status}): ${redactSensitiveText(body)}`)
  }

  const json = (await response.json()) as LinkedInAuthResponse
  if (!json.access_token) {
    throw new Error("LinkedIn token refresh succeeded but access_token was missing.")
  }
  return json.access_token
}

export async function publishOrganizationPost(input: PublishPostInput): Promise<string> {
  const accessToken = await fetchLinkedInAccessToken()
  const apiVersion = resolveLinkedInVersion()

  const payload = {
    author: input.authorUrn,
    commentary: input.commentary,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  }

  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "Linkedin-Version": apiVersion,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`LinkedIn post publish failed (${response.status}): ${redactSensitiveText(body)}`)
  }

  const postUrn = response.headers.get("x-restli-id")
  if (!postUrn) {
    throw new Error("LinkedIn publish response did not include x-restli-id.")
  }

  return postUrn
}
