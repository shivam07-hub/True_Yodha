/**
 * Light-surface sun placement. The viewport is an 8×8; the bloom lives in
 * the cell ~6.5 steps toward the farthest corner from the pointer. Cast
 * falls from the sun toward the pointer. Parked rest assumes the left rail.
 */

export type Cell = { readonly x: number; readonly y: number }

export type SunCss = {
  sunX: string
  sunY: string
  castX: string
  castY: string
}

export const GRID = 8
export const TARGET_BLOCKS = 6.5
export const CAST_PX = 22
/** Left rail, mid-page — where a Market user actually rests. */
export const RESTING_CURSOR: Cell = { x: 1, y: 4 }

function clampCell(n: number): number {
  return Math.max(0, Math.min(GRID - 1, n))
}

export function cellOfPoint(px: number, py: number, w: number, h: number): Cell {
  const width = Math.max(w, 1)
  const height = Math.max(h, 1)
  return {
    x: clampCell(Math.floor((px / width) * GRID)),
    y: clampCell(Math.floor((py / height) * GRID)),
  }
}

export function chebyshev(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

function farthestCorner(cursor: Cell): Cell {
  const corners: Cell[] = [
    { x: 0, y: 0 },
    { x: GRID - 1, y: 0 },
    { x: 0, y: GRID - 1 },
    { x: GRID - 1, y: GRID - 1 },
  ]
  let best = corners[0]
  let bestCheb = -1
  let bestAir = -1
  for (const corner of corners) {
    const cheb = chebyshev(cursor, corner)
    const air = Math.hypot(corner.x - cursor.x, corner.y - cursor.y)
    if (cheb > bestCheb || (cheb === bestCheb && air > bestAir)) {
      bestCheb = cheb
      bestAir = air
      best = corner
    }
  }
  return best
}

export function sunFromCursor(cursor: Cell): Cell {
  const far = farthestCorner(cursor)
  const maxD = chebyshev(cursor, far)
  const target = Math.min(maxD, Math.round(TARGET_BLOCKS))
  const dx = Math.sign(far.x - cursor.x)
  const dy = Math.sign(far.y - cursor.y)
  let x = cursor.x
  let y = cursor.y
  for (let step = 0; step < target; step += 1) {
    if (x !== far.x) x += dx
    if (y !== far.y) y += dy
  }
  return { x, y }
}

export function cellCenterPercent(cell: Cell): { x: number; y: number } {
  return {
    x: ((cell.x + 0.5) / GRID) * 100,
    y: ((cell.y + 0.5) / GRID) * 100,
  }
}

export function cssFromCells(cursor: Cell, sun: Cell): SunCss {
  const center = cellCenterPercent(sun)
  const dx = cursor.x - sun.x
  const dy = cursor.y - sun.y
  const len = Math.hypot(dx, dy) || 1
  return {
    sunX: `${center.x}%`,
    sunY: `${center.y}%`,
    castX: `${((dx / len) * CAST_PX).toFixed(1)}px`,
    castY: `${((dy / len) * CAST_PX).toFixed(1)}px`,
  }
}

export function cssFromPointer(
  px: number,
  py: number,
  w: number,
  h: number,
): { cursor: Cell; sun: Cell; css: SunCss } {
  const cursor = cellOfPoint(px, py, w, h)
  const sun = sunFromCursor(cursor)
  return { cursor, sun, css: cssFromCells(cursor, sun) }
}

export function parkedCss(): SunCss {
  return cssFromCells(RESTING_CURSOR, sunFromCursor(RESTING_CURSOR))
}
