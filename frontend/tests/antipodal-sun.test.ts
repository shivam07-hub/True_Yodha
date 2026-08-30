import assert from "node:assert/strict"
import test from "node:test"

import {
  CAST_PX,
  GRID,
  RESTING_CURSOR,
  cellOfPoint,
  chebyshev,
  cssFromCells,
  cssFromPointer,
  parkedCss,
  sunFromCursor,
} from "../lib/theme/antipodal-sun"

test("an 8×8 maps the corners of the viewport to the corner cells", () => {
  assert.deepEqual(cellOfPoint(0, 0, 800, 800), { x: 0, y: 0 })
  assert.deepEqual(cellOfPoint(799, 799, 800, 800), { x: 7, y: 7 })
  assert.equal(GRID, 8)
})

test("from a corner the sun sits 6–7 king-moves away", () => {
  const cursor = { x: 0, y: 0 }
  const sun = sunFromCursor(cursor)
  assert.ok(chebyshev(cursor, sun) >= 6, `sun ${sun.x},${sun.y} too close to origin`)
  assert.ok(sun.x >= 5 && sun.y >= 5)
})

test("from the opposite corner the sun flees back across the board", () => {
  const cursor = { x: 7, y: 0 }
  const sun = sunFromCursor(cursor)
  assert.ok(chebyshev(cursor, sun) >= 6)
  assert.ok(sun.x <= 2)
  assert.ok(sun.y >= 5)
})

test("from the centre 6–7 is off-screen so the sun clamps to a corner", () => {
  const cursor = { x: 3, y: 3 }
  const sun = sunFromCursor(cursor)
  const dist = chebyshev(cursor, sun)
  assert.ok(dist >= 3 && dist <= 4, `centre must clamp, got ${dist} to ${sun.x},${sun.y}`)
  assert.ok(sun.x === 0 || sun.x === 7)
  assert.ok(sun.y === 0 || sun.y === 7)
})

test("cast falls from the sun toward the pointer", () => {
  const cursor = { x: 1, y: 4 }
  const sun = sunFromCursor(cursor)
  const css = cssFromCells(cursor, sun)
  const castX = parseFloat(css.castX)
  const castY = parseFloat(css.castY)
  if (cursor.x < sun.x) assert.ok(castX < 0)
  if (cursor.y < sun.y) assert.ok(castY < 0)
  const mag = Math.hypot(castX, castY)
  assert.ok(Math.abs(mag - CAST_PX) < 0.15)
})

test("parked rest is 6–7 cells from the left rail", () => {
  const sun = sunFromCursor(RESTING_CURSOR)
  assert.ok(chebyshev(RESTING_CURSOR, sun) >= 6)
  const css = parkedCss()
  assert.match(css.sunX, /%$/)
  assert.match(css.castX, /px$/)
})

test("pointer helper returns the same sun as the cell path", () => {
  const viaCells = sunFromCursor(cellOfPoint(40, 420, 800, 800))
  const viaPointer = cssFromPointer(40, 420, 800, 800)
  assert.deepEqual(viaPointer.sun, viaCells)
})
