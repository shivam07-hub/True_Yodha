/**
 * #61 S1 — one signal for "am I inside the Android app?"
 */
import assert from "node:assert/strict"
import test from "node:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { isAndroidApp, readAppShell, referrerIsAndroidApp } from "../lib/platform/app-shell"

class MemoryStorage {
  private readonly values = new Map<string, string>()
  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

test("the query signal reads android and the session remembers it", () => {
  const storage = new MemoryStorage()
  assert.equal(readAppShell({ search: "?shell=android", referrer: "", storage }), "android")
  assert.equal(storage.getItem("myro-app-shell"), "android")
})

test("the referrer signal reads android", () => {
  const storage = new MemoryStorage()
  assert.equal(referrerIsAndroidApp("android-app://com.himyro.app"), true)
  assert.equal(
    readAppShell({
      search: "",
      referrer: "android-app://com.himyro.app/https/www.himyro.com",
      storage,
    }),
    "android",
  )
  assert.equal(storage.getItem("myro-app-shell"), "android")
})

test("a plain browser tab reads web and stores nothing", () => {
  const storage = new MemoryStorage()
  assert.equal(
    readAppShell({ search: "", referrer: "https://www.himyro.com/", storage }),
    "web",
  )
  assert.equal(storage.getItem("myro-app-shell"), null)
  assert.equal(referrerIsAndroidApp("android-app://com.example.app"), false)
})

test("a reload in the same session still reads android", () => {
  const storage = new MemoryStorage()
  readAppShell({ search: "?shell=android", referrer: "", storage })
  assert.equal(readAppShell({ search: "", referrer: "", storage }), "android")
})

test("a blocked session store does not throw, and the signal still reads", () => {
  const storage = {
    getItem(): string | null { throw new Error("blocked") },
    setItem(): void { throw new Error("blocked") },
  }
  assert.equal(readAppShell({ search: "?shell=android", referrer: "", storage }), "android")
})

test("without a browser the shell is web", () => {
  assert.equal(isAndroidApp(), false)
})

test("only the shell module reads the Android referrer", () => {
  const shell = readFileSync(new URL("../lib/platform/app-shell.ts", import.meta.url), "utf8")
  assert.match(shell, /android-app:\/\/com\.himyro\.app/)
  assert.match(shell, /sessionStorage/)
  assert.doesNotMatch(shell, /localStorage/)
  const root = new URL("..", import.meta.url).pathname
  const hits: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next") continue
      const path = join(dir, name)
      if (statSync(path).isDirectory()) { walk(path); continue }
      if (!/\.(ts|tsx)$/.test(name)) continue
      if (readFileSync(path, "utf8").includes("document.referrer")) hits.push(path)
    }
  }
  for (const dir of ["app", "components", "lib", "mobile"]) walk(join(root, dir))
  assert.deepEqual(hits.map(path => path.slice(root.length)), ["lib/platform/app-shell.ts"])
})
