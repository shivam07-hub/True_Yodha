import assert from "node:assert/strict"
import test from "node:test"

import nextConfig from "../next.config.mjs"

test("retired URLs redirect at the edge, before a 200 document", async () => {
  const rules = await nextConfig.redirects()
  const homeJob = rules.find((rule) => rule.source === "/home" && rule.has)
  const home = rules.find((rule) => rule.source === "/home" && !rule.has)

  assert.ok(homeJob, "/home?jobId= must be its own rule")
  assert.equal(homeJob.destination, "/collections?jobId=:jobId")
  assert.equal(homeJob.permanent, true)
  assert.ok(rules.indexOf(homeJob) < rules.indexOf(home), "jobId rule must win over bare /home")

  assert.equal(home.destination, "/market")
  assert.equal(home.permanent, true)

  const dest = new Map(
    rules.filter((rule) => !rule.has).map((rule) => [rule.source, rule.destination]),
  )
  assert.equal(dest.get("/welcome"), "/")
  assert.equal(dest.get("/dashboard"), "/practice")
  assert.equal(dest.get("/myro"), "/market")
  assert.equal(dest.get("/xp"), "/tokens")
  for (const source of ["/welcome", "/dashboard", "/myro", "/xp"]) {
    assert.equal(rules.find((rule) => rule.source === source).permanent, true)
  }
})
