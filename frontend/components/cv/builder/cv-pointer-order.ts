/**
 * Pointer reorder — pure helpers for experience/project bullet order.
 *
 * itemId encodes the bullet's index (`ei * 100 + bi`), so a reorder changes
 * every iid in the group. Hidden projection keys off those iids; remap them
 * in the same tick as the write so hide/show does not jump to a neighbour.
 */
import { itemId } from "@/lib/cv-compose"
import type { CVStructured } from "@/lib/api"
import type { LineTone } from "./cv-severity"

export type PointerKind = "exp_bullet" | "proj_bullet"

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return [...list]
  }
  const next = [...list]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) return [...list]
  next.splice(to, 0, moved)
  return next
}

export function neighbourIndex(from: number, delta: number, length: number): number | null {
  const to = from + delta
  if (to < 0 || to >= length || from === to) return null
  return to
}

/** Collapse state follows the bullet's text, not its index, so a reorder
 *  does not expand a different pointer. Duplicates get an occurrence suffix. */
export function collapseKey(text: string, occurrence: number): string {
  return `${occurrence}:${text}`
}

export function occurrences(bullets: readonly string[]): number[] {
  const seen = new Map<string, number>()
  return bullets.map(b => {
    const n = seen.get(b) ?? 0
    seen.set(b, n + 1)
    return n
  })
}

/**
 * Default: expand the line that is being fixed or edited, and expand weak/
 * blocking findings. Collapse on-target (and unflagged) pointers once a role
 * has more than two — the compact preview is the document; the rest is chrome.
 */
export function defaultExpanded(opts: {
  bulletCount: number
  tone?: LineTone
  isOpen: boolean
  isEditing: boolean
}): boolean {
  if (opts.isOpen || opts.isEditing) return true
  if (opts.tone === "blocking" || opts.tone === "weak") return true
  return opts.bulletCount <= 2
}

export function remapHiddenIids(
  hidden: Set<string>,
  kind: PointerKind,
  groupIndex: number,
  bullets: readonly string[],
  from: number,
  to: number,
): Set<string> {
  if (from === to) return hidden
  const perm = permutation(from, to, bullets.length)
  const next = new Set(hidden)
  for (let newI = 0; newI < perm.length; newI++) {
    const oldI = perm[newI]
    const text = bullets[oldI]
    const oldIid = itemId(kind, groupIndex * 100 + oldI, text)
    const newIid = itemId(kind, groupIndex * 100 + newI, text)
    if (oldIid === newIid) continue
    if (next.has(oldIid)) {
      next.delete(oldIid)
      next.add(newIid)
    }
  }
  return next
}

/** At each new index, the old index that lands there. */
export function permutation(from: number, to: number, length: number): number[] {
  const order = Array.from({ length }, (_, i) => i)
  const [moved] = order.splice(from, 1)
  if (moved === undefined) return order
  order.splice(to, 0, moved)
  return order
}

export function arrangeByText<T extends { text: string }>(
  rows: readonly T[],
  order: string[] | null,
): T[] {
  if (!order) return [...rows]
  const unused = [...rows]
  const out: T[] = []
  for (const text of order) {
    const i = unused.findIndex(r => r.text === text)
    if (i < 0) continue
    const [row] = unused.splice(i, 1)
    if (row) out.push(row)
  }
  return out.length === rows.length ? out : [...rows]
}

export function applyRoleMove(cv: CVStructured, from: number, to: number): CVStructured {
  return { ...cv, experience: moveItem(cv.experience, from, to) }
}

export function remapRoleHiddenIids(
  hidden: Set<string>,
  roles: readonly { bullets: string[] }[],
  from: number,
  to: number,
): Set<string> {
  if (from === to) return hidden
  const perm = permutation(from, to, roles.length)
  const next = new Set(hidden)
  for (let newEi = 0; newEi < perm.length; newEi++) {
    const oldEi = perm[newEi]
    const bullets = roles[oldEi]?.bullets ?? []
    bullets.forEach((text, bi) => {
      const oldIid = itemId("exp_bullet", oldEi * 100 + bi, text)
      const newIid = itemId("exp_bullet", newEi * 100 + bi, text)
      if (oldIid === newIid) return
      if (next.has(oldIid)) {
        next.delete(oldIid)
        next.add(newIid)
      }
    })
  }
  return next
}

export function applyBulletMove(
  cv: CVStructured,
  section: "experience" | "projects",
  groupIndex: number,
  from: number,
  to: number,
): CVStructured {
  if (section === "experience") {
    const group = cv.experience[groupIndex]
    if (!group) return cv
    const next = cv.experience.slice()
    next[groupIndex] = { ...group, bullets: moveItem(group.bullets, from, to) }
    return { ...cv, experience: next }
  }
  const group = cv.projects[groupIndex]
  if (!group) return cv
  const next = cv.projects.slice()
  next[groupIndex] = { ...group, bullets: moveItem(group.bullets, from, to) }
  return { ...cv, projects: next }
}
