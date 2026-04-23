export type DiarySkillIntent = "add" | "upgrade"
export type DiarySkillSource = "job-gap" | "skill-demand"

export interface DiarySkillSelection {
  skill: string
  intent: DiarySkillIntent
  level?: number | null
  source?: DiarySkillSource
}

export interface DiaryPrefill {
  skills: string[]
  entryText: string
}

const SELECTIONS_PARAM = "skillSelections"

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

function listSkills(skills: string[]): string {
  if (skills.length <= 1) return skills[0] ?? ""
  if (skills.length === 2) return `${skills[0]} and ${skills[1]}`
  return `${skills.slice(0, -1).join(", ")}, and ${skills.at(-1)}`
}

function describeUpgrade(selection: DiarySkillSelection): string {
  return selection.level ? `${selection.skill} (currently L${selection.level})` : selection.skill
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

export function buildDiarySelectionsHref(selections: DiarySkillSelection[]): string {
  const normalized = dedupeSelections(selections.map((selection) => sanitizeSelection(selection)).filter(Boolean) as DiarySkillSelection[])
  if (normalized.length === 0) return "/diary"

  const params = new URLSearchParams()
  params.set(SELECTIONS_PARAM, JSON.stringify(normalized))
  return `/diary?${params.toString()}`
}

export function parseDiarySelections(searchParams: URLSearchParams): DiarySkillSelection[] {
  const rawSelections = searchParams.get(SELECTIONS_PARAM)
  if (rawSelections) {
    try {
      const parsed = JSON.parse(rawSelections)
      if (Array.isArray(parsed)) {
        return dedupeSelections(parsed.map((selection) => sanitizeSelection(selection)).filter(Boolean) as DiarySkillSelection[])
      }
    } catch {
      // Fall through to legacy params.
    }
  }

  const singleSkill = searchParams.get("skill")
  if (singleSkill) {
    const level = Number.parseInt(searchParams.get("level") ?? "", 10)
    const selection = sanitizeSelection({
      skill: singleSkill,
      intent: typeof searchParams.get("level") === "string" ? "upgrade" : "add",
      level: Number.isNaN(level) ? undefined : level,
    })
    return selection ? [selection] : []
  }

  const skills = (searchParams.get("skills") ?? "")
    .split(",")
    .map((skill) => sanitizeSkill(skill))
    .filter(Boolean) as string[]

  return skills.map((skill) => ({ skill, intent: "add" as const }))
}

export function buildDiaryPrefill(selections: DiarySkillSelection[]): DiaryPrefill {
  const normalized = dedupeSelections(selections.map((selection) => sanitizeSelection(selection)).filter(Boolean) as DiarySkillSelection[])
  const skills = normalized.map((selection) => selection.skill)
  if (skills.length === 0) return { skills: [], entryText: "" }

  const additions = normalized.filter((selection) => selection.intent === "add")
  const upgrades = normalized.filter((selection) => selection.intent === "upgrade")
  const sections: string[] = []

  if (additions.length === 1 && upgrades.length === 0) {
    sections.push(
      `Skill Focus — ${additions[0].skill}\n` +
      `I want to start building ${additions[0].skill} this week through deliberate practice and real application.`,
    )
  } else if (additions.length > 0) {
    sections.push(
      `New Skill Focus\n` +
      `I want to start building these skills this week: ${listSkills(additions.map((selection) => selection.skill))}.`,
    )
  }

  if (upgrades.length === 1 && additions.length === 0) {
    sections.push(
      `Skill Upgrade — ${upgrades[0].skill}\n` +
      `I want to deepen ${describeUpgrade(upgrades[0])} this week through deliberate practice and real application.`,
    )
  } else if (upgrades.length > 0) {
    sections.push(
      `Upgrade Focus\n` +
      `I want to deepen these skills this week: ${listSkills(upgrades.map(describeUpgrade))}.`,
    )
  }

  return {
    skills,
    entryText: sections.join("\n\n"),
  }
}
