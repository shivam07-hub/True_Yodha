/**
 * #61 S2 — a Sale opens in one module. A salary is not a Sale.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { isSalePath, SALE_PATHS, saleMayOpen } from "../lib/sale"

test("a sale opens on the web and not inside the Android app", () => {
  assert.equal(saleMayOpen("web"), true)
  assert.equal(saleMayOpen("android"), false)
})

test("the sale routes are the four charges", () => {
  assert.deepEqual([...SALE_PATHS], [
    "/filing",
    "/job-switch-plan",
    "/preparations/audit",
    "/myrology",
  ])
  assert.equal(isSalePath("/filing"), true)
  assert.equal(isSalePath("/myrology/checkout"), true)
  assert.equal(isSalePath("/market"), false)
})

test("only the sale module loads Razorpay or creates an order", () => {
  const root = new URL("..", import.meta.url).pathname
  const hits: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next") continue
      const path = join(dir, name)
      if (statSync(path).isDirectory()) { walk(path); continue }
      if (!/\.(ts|tsx)$/.test(name)) continue
      const text = readFileSync(path, "utf8")
      if (text.includes("billing.createOrder(") || text.includes("loadRazorpay")) hits.push(path)
    }
  }
  for (const dir of ["app", "components", "lib", "mobile"]) walk(join(root, dir))
  const rel = hits.map((path) => path.slice(root.length).replace(/^\//, ""))
  assert.deepEqual(rel.sort(), ["lib/razorpay.ts", "lib/sale.ts"].sort())
})

test("the sale module decides from the shell before it loads a checkout", () => {
  const sale = readFileSync(new URL("../lib/sale.ts", import.meta.url), "utf8")
  const body = sale.slice(sale.indexOf("export async function openSale"))
  assert.ok(body.indexOf("saleMayOpen") < body.indexOf("loadRazorpay"))
  assert.ok(body.indexOf("saleMayOpen") < body.indexOf("billing.createOrder"))
})
