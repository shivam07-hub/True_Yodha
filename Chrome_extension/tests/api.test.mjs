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
