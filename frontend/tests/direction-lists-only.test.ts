import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

import { primaryLocation } from "../lib/career-target"

// CONTEXT → Targeting Brief: the singular `target_location` / `target_role_title`
// are synced copies of the lists' first entries, approved to be dropped
// (Shivam, 2026-10-27). The frontend reads the lists.

test("the primary location is the list's first entry", () => {
  assert.equal(primaryLocation({ target_locations: [" Pune ", "Mumbai"] }), "Pune")
  assert.equal(primaryLocation({ target_locations: [] }), "")
  assert.equal(primaryLocation(null), "")
})

test("no frontend file reads the singular direction fields", () => {
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (name === "node_modules" || name === ".next") continue
      if (statSync(path).isDirectory()) { walk(path); continue }
      if (!/\.(ts|tsx)$/.test(name) || /\.test\./.test(name)) continue
      const text = readFileSync(path, "utf8")
      if (/\.target_location\b|\.target_role_title\b|\.target_location_country\b|"target_location"|"target_role_title"/.test(text)) {
        offenders.push(path)
      }
    }
  }
  for (const root of ["lib", "components", "app"]) walk(resolve(process.cwd(), root))
  assert.deepEqual(offenders, [])
})
