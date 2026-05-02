#!/usr/bin/env tsx
/**
 * sync-newsletter.ts
 * Copies *.mdx from Myro Newsletter/issues/ → frontend/content/newsletter/issues/
 * Also copies dashboard HTML to frontend/public/newsletter/charts/
 *
 * Usage:
 *   tsx scripts/sync-newsletter.ts           # live sync
 *   tsx scripts/sync-newsletter.ts --dry-run # check only, exit 1 if changes needed
 */

import fs from "fs"
import path from "path"
import crypto from "crypto"

const DRY_RUN = process.argv.includes("--dry-run")

const REPO_ROOT = path.resolve(__dirname, "..")
const SOURCE_DIR = process.env.NEWSLETTER_SOURCE_DIR
  ?? path.resolve(REPO_ROOT, "..", "Myro Newsletter", "issues")
const DEST_DIR = path.resolve(REPO_ROOT, "frontend", "content", "newsletter", "issues")
const CHART_SOURCE_DIR = path.resolve(REPO_ROOT, "..", "Myro Newsletter", "Dashboards on jobs table")
const CHART_DEST_DIR = path.resolve(REPO_ROOT, "frontend", "public", "newsletter", "charts")

const REQUIRED_FIELDS = ["title", "slug", "publishedAt", "theme", "primaryKeyword", "ctaRole", "summary"] as const

function parseFrontmatter(content: string, file: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) throw new Error(`${file}: no frontmatter block found`)
  const fm: Record<string, string> = {}
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(": ")
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const val = line.slice(colonIdx + 2).trim().replace(/^["']|["']$/g, "")
    fm[key] = val
  }
  return fm
}

function validateFrontmatter(fm: Record<string, string>, filename: string): void {
  for (const field of REQUIRED_FIELDS) {
    if (!fm[field]) throw new Error(`${filename}: missing required field "${field}"`)
  }
  const expectedSlug = path.basename(filename, ".mdx")
  if (fm.slug !== expectedSlug) {
    throw new Error(`${filename}: slug "${fm.slug}" does not match filename "${expectedSlug}"`)
  }
}

function fileHash(p: string): string {
  return crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex")
}

function syncDirectory(srcDir: string, dstDir: string, ext: string, label: string): { added: string[]; updated: string[]; removed: string[] } {
  if (!fs.existsSync(srcDir)) {
    console.error(`ERROR: source directory not found: ${srcDir}`)
    process.exit(1)
  }
  fs.mkdirSync(dstDir, { recursive: true })

  const srcFiles = fs.readdirSync(srcDir).filter(f => f.endsWith(ext))
  const dstFiles = new Set(fs.readdirSync(dstDir).filter(f => f.endsWith(ext)))

  const added: string[] = []
  const updated: string[] = []
  const removed: string[] = []

  for (const file of srcFiles) {
    const src = path.join(srcDir, file)
    const dst = path.join(dstDir, file)
    const isNew = !dstFiles.has(file)
    const isChanged = !isNew && fileHash(src) !== fileHash(dst)
    if (isNew) added.push(file)
    else if (isChanged) updated.push(file)
    if (isNew || isChanged) {
      if (!DRY_RUN) fs.copyFileSync(src, dst)
    }
  }

  for (const file of Array.from(dstFiles)) {
    const srcExists = srcFiles.includes(file)
    if (!srcExists) {
      removed.push(file)
      if (!DRY_RUN) fs.unlinkSync(path.join(dstDir, file))
    }
  }

  return { added, updated, removed }
}

function run(): void {
  console.log(`\n📋 Newsletter sync ${DRY_RUN ? "(DRY RUN)" : ""}\n`)

  // Validate MDX files before any copy
  const srcFiles = fs.existsSync(SOURCE_DIR)
    ? fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith(".mdx") && !f.startsWith("_"))
    : []

  let hasError = false
  for (const file of srcFiles) {
    try {
      const content = fs.readFileSync(path.join(SOURCE_DIR, file), "utf8")
      const fm = parseFrontmatter(content, file)
      validateFrontmatter(fm, file)
    } catch (e) {
      console.error(`VALIDATION ERROR: ${(e as Error).message}`)
      hasError = true
    }
  }
  if (hasError) {
    console.error("\nSync aborted due to validation errors.\n")
    process.exit(1)
  }

  // Sync MDX
  const mdx = syncDirectory(SOURCE_DIR, DEST_DIR, ".mdx", "MDX issues")
  console.log(`MDX issues:`)
  if (mdx.added.length) console.log(`  + added:   ${mdx.added.join(", ")}`)
  if (mdx.updated.length) console.log(`  ~ updated: ${mdx.updated.join(", ")}`)
  if (mdx.removed.length) console.log(`  - removed: ${mdx.removed.join(", ")}`)
  if (!mdx.added.length && !mdx.updated.length && !mdx.removed.length) {
    console.log(`  ✓ in sync (${srcFiles.length} issue${srcFiles.length !== 1 ? "s" : ""})`)
  }

  // Sync dashboard HTML
  const charts = syncDirectory(CHART_SOURCE_DIR, CHART_DEST_DIR, ".html", "Charts")
  console.log(`Charts:`)
  if (charts.added.length) console.log(`  + added:   ${charts.added.join(", ")}`)
  if (charts.updated.length) console.log(`  ~ updated: ${charts.updated.join(", ")}`)
  if (charts.removed.length) console.log(`  - removed: ${charts.removed.join(", ")}`)
  if (!charts.added.length && !charts.updated.length && !charts.removed.length) {
    console.log(`  ✓ in sync`)
  }

  const hasChanges = [mdx, charts].some(r => r.added.length || r.updated.length || r.removed.length)

  if (DRY_RUN && hasChanges) {
    console.log("\n❌ Out of sync. Run: npm run newsletter:sync\n")
    process.exit(1)
  }

  if (!hasChanges) {
    console.log("\n✓ Everything in sync.\n")
  } else {
    console.log(`\n✓ Sync complete. ${srcFiles.length} issue(s) in frontend/content/newsletter/issues/\n`)
  }
}

run()
