#!/usr/bin/env tsx
/**
 * linkedin-publish-due.ts
 * Validates LinkedIn outbox files and publishes due scheduled posts.
 *
 * Usage:
 *   tsx scripts/linkedin-publish-due.ts --check-only
 *   tsx scripts/linkedin-publish-due.ts --execute
 */

import { loadLinkedInOutboxPosts, markPostPublished } from "./linkedin-outbox"
import { publishOrganizationPost } from "./linkedin-client"

const CHECK_ONLY = process.argv.includes("--check-only")
const EXECUTE = process.argv.includes("--execute")

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function formatUtc(d: Date): string {
  return d.toISOString().replace("T", " ").replace(".000Z", "Z")
}

async function main(): Promise<void> {
  const now = new Date()
  const posts = loadLinkedInOutboxPosts()

  console.log(`\nLinkedIn outbox scan (${CHECK_ONLY ? "check" : EXECUTE ? "execute" : "dry-run"})`)
  console.log(`UTC now: ${formatUtc(now)}`)
  console.log(`Found ${posts.length} LinkedIn post draft(s).`)

  const scheduled = posts.filter(p => p.status === "scheduled")
  const due = scheduled.filter(p => p.publishTime.getTime() <= now.getTime())
  const pending = scheduled.filter(p => p.publishTime.getTime() > now.getTime())

  console.log(`Scheduled: ${scheduled.length} | Due: ${due.length} | Future: ${pending.length}`)

  const blocked = due.filter(p => p.reviewDeadline.getTime() > now.getTime())
  if (blocked.length > 0) {
    const names = blocked.map(p => p.fileName).join(", ")
    throw new Error(`Due post(s) are still inside review window: ${names}`)
  }

  if (due.length === 0) {
    console.log("No due scheduled posts.\n")
    return
  }

  if (CHECK_ONLY) {
    for (const post of due) {
      console.log(`- due: ${post.fileName} @ ${formatUtc(post.publishTime)}`)
    }
    console.log("\nValidation complete.\n")
    return
  }

  if (!EXECUTE) {
    for (const post of due) {
      console.log(`- would publish: ${post.fileName} @ ${formatUtc(post.publishTime)}`)
    }
    console.log("\nDry run complete. Re-run with --execute to publish.\n")
    return
  }

  const organizationUrn = requireEnv("LINKEDIN_ORGANIZATION_URN")

  for (const post of due) {
    console.log(`\nPublishing ${post.fileName}...`)
    const postUrn = await publishOrganizationPost({
      authorUrn: organizationUrn,
      commentary: post.copy,
    })

    const publishedAtIso = new Date().toISOString()
    markPostPublished(post.filePath, postUrn, publishedAtIso)

    console.log(`Published ${post.fileName} -> ${postUrn}`)
  }

  console.log(`\nDone. Published ${due.length} post(s).\n`)
}

main().catch((err) => {
  console.error(`\n${(err as Error).message}\n`)
  process.exit(1)
})
