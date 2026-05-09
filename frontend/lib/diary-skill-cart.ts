export type DiarySkillIntent = "add" | "upgrade"
export type DiarySkillSource = "job-gap" | "skill-demand"

export interface DiarySkillSelection {
  skill: string
  intent: DiarySkillIntent
  level?: number | null
  source?: DiarySkillSource
}

function sanitizeSkill(value: unknown): string | null {
  if (typeof value !== "string") return null
  const skill = value.trim()
  return skill ? skill : null
}

function sanitizeIntent(value: unknown): DiarySkillIntent {
  return value === "upgrade" ? "upgrade" : "add"
}

function sanitizeSource(value: unknown): DiarySkillSource | undefined {
  if (value === "job-gap" || value === "skill-demand") return value
  return undefined
}

function sanitizeLevel(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  const rounded = Math.round(value)
  if (rounded < 1) return undefined
  return rounded
}

function sanitizeSelection(value: unknown): DiarySkillSelection | null {
  if (typeof value !== "object" || value === null) return null
  const record = value as Record<string, unknown>
  const skill = sanitizeSkill(record.skill)
  if (!skill) return null
  const level = sanitizeLevel(record.level)
  const source = sanitizeSource(record.source)
  return {
    skill,
    intent: sanitizeIntent(record.intent),
    ...(typeof level === "number" ? { level } : {}),
    ...(source ? { source } : {}),
  }
}

function selectionKey(skill: string): string {
  return skill.trim().toLowerCase()
}

function dedupeSelections(selections: DiarySkillSelection[]): DiarySkillSelection[] {
  const next = new Map<string, DiarySkillSelection>()
  for (const selection of selections) {
    next.set(selectionKey(selection.skill), selection)
  }
  return Array.from(next.values())
}

export function toggleDiarySelection(
  current: DiarySkillSelection[],
  nextSelection: DiarySkillSelection,
): DiarySkillSelection[] {
  const next = sanitizeSelection(nextSelection)
  if (!next) return dedupeSelections(current)

  const key = selectionKey(next.skill)
  const exists = current.some((selection) => selectionKey(selection.skill) === key)
  if (exists) {
    return current.filter((selection) => selectionKey(selection.skill) !== key)
  }
  return dedupeSelections([...current, next])
}
