import { test } from "node:test"
import assert from "node:assert/strict"
import { adaptiveGreeting } from "../lib/mission-control/greeting"

test("sustained streak → momentum verb with glyph", () => {
  const g = adaptiveGreeting({ streak: 7, scoreDelta: 0, loggedToday: false })
  assert.equal(g.text, "On a roll")
  assert.equal(g.emoji, "🔥")
})

test("streak takes precedence over score and time", () => {
  const g = adaptiveGreeting({ streak: 3, scoreDelta: 5, loggedToday: true, hour: 9 })
  assert.equal(g.text, "On a roll")
})

test("score climbed (no streak) → progress verb, no glyph", () => {
  const g = adaptiveGreeting({ streak: 0, scoreDelta: 4, loggedToday: false })
  assert.equal(g.text, "Trending up")
  assert.equal(g.emoji, undefined)
})

test("recent touch (logged today, no streak/score) → return verb", () => {
  const g = adaptiveGreeting({ streak: 0, scoreDelta: 0, loggedToday: true })
  assert.equal(g.text, "Welcome back")
})

test("partial streak (1–2) counts as return, not momentum", () => {
  const g = adaptiveGreeting({ streak: 1, scoreDelta: 0, loggedToday: false })
  assert.equal(g.text, "Welcome back")
})

test("quiet floor falls back to time of day", () => {
  assert.equal(adaptiveGreeting({ streak: 0, scoreDelta: 0, loggedToday: false, hour: 8 }).text, "Good morning")
  assert.equal(adaptiveGreeting({ streak: 0, scoreDelta: 0, loggedToday: false, hour: 14 }).text, "Good afternoon")
  assert.equal(adaptiveGreeting({ streak: 0, scoreDelta: 0, loggedToday: false, hour: 20 }).text, "Good evening")
})

test("negative score delta does not count as progress", () => {
  const g = adaptiveGreeting({ streak: 0, scoreDelta: -2, loggedToday: false, hour: 20 })
  assert.equal(g.text, "Good evening")
})
