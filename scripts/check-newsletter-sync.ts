#!/usr/bin/env tsx
/**
 * check-newsletter-sync.ts
 * Dry-run parity check. Exits 1 if frontend/content/newsletter/ is out of sync.
 * Used as prebuild hook and in CI.
 */

import { execFileSync } from "child_process"
import path from "path"

const syncScript = path.resolve(__dirname, "sync-newsletter.ts")

try {
  execFileSync("tsx", [syncScript, "--dry-run"], { stdio: "inherit" })
} catch {
  process.exit(1)
}
