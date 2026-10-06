import test from "node:test"
import assert from "node:assert/strict"
import { reachSearch } from "../src/api.js"

test("reach search names the saved job by id and sends no job fields", async () => {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    return { ok: true, status: 200, json: async () => ({ primary: null, alternates: [] }) }
  }
  await reachSearch("https://api.himyro.com/", "tok", "ext_ab/c")
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, "https://api.himyro.com/jobs/ext_ab%2Fc/reach/search")
  assert.equal(calls[0].init.method, "GET")
  assert.equal(calls[0].init.body, undefined)
})

test("page entry asks the server about the page URL", async () => {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    return { ok: true, status: 200, json: async () => ({ entry: null }) }
  }
  const { pageEntry } = await import("../src/api.js")
  const out = await pageEntry("https://api.himyro.com", "tok", "https://jobs.lever.co/acme/1?src=LinkedIn")
  assert.deepEqual(out, { entry: null })
  assert.equal(calls[0].url, "https://api.himyro.com/jobs/collections/page")
  assert.equal(calls[0].init.method, "POST")
  assert.deepEqual(JSON.parse(calls[0].init.body), { url: "https://jobs.lever.co/acme/1?src=LinkedIn" })
})
