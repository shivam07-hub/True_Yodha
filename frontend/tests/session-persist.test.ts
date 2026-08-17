import test from "node:test"
import assert from "node:assert/strict"

import { migrateTabSessionToDurable } from "../lib/session"

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  get length() {
    return this.values.size
  }
}

test("tab-scoped tokens move into durable storage so a closed tab stays signed in", () => {
  const durable = new MemoryStorage()
  const tab = new MemoryStorage()
  tab.setItem("mirror_token", "access")
  tab.setItem("mirror_refresh_token", "refresh")
  tab.setItem("sb-abc-auth-token", "{\"access_token\":\"sb\"}")

  migrateTabSessionToDurable(durable, tab)

  assert.equal(durable.getItem("mirror_token"), "access")
  assert.equal(durable.getItem("mirror_refresh_token"), "refresh")
  assert.equal(durable.getItem("sb-abc-auth-token"), "{\"access_token\":\"sb\"}")
  assert.equal(tab.getItem("mirror_token"), null)
  assert.equal(tab.getItem("sb-abc-auth-token"), null)
})

test("durable tokens win when both stores still hold a session", () => {
  const durable = new MemoryStorage()
  const tab = new MemoryStorage()
  durable.setItem("mirror_token", "kept")
  tab.setItem("mirror_token", "stale")

  migrateTabSessionToDurable(durable, tab)

  assert.equal(durable.getItem("mirror_token"), "kept")
  assert.equal(tab.getItem("mirror_token"), null)
})
