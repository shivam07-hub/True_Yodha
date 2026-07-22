import type { GapSkill, ScoreResponse, UserSkillItem, UserSkillsByDomain } from "@/lib/api"
import { MAX_LEVEL, sessionsToNextLevel } from "@/lib/level-thresholds"

/**
 * Read model for the skill room (`/skills?skill=`) — altitude 3+4 of the
 * evidence ladder: the named bracket a skill sits in, where that sits in the
 * taxonomy, and the verbatim CV line Myro read the level from.
 *
 * Every field is data the score payload already carries; the room adds NO
 * request. Anything absent stays absent — a missing taxonomy definition or an
 * unproven skill renders as its honest empty state, never a placeholder.
 *
 * NOTE: this is TAXONOMY position, never PEER position. Per-skill percentile is
 * density-gated (backlog #39, MIN_BAND_PEERS) and is deliberately not modelled
 * here — conflating "where this sits in the skill graph" with "you beat N% of
 * people" is the same class of error as the `top X%` mis-cue.
 */
export interface SkillRoomModel {
  skill: UserSkillItem
  /** L1 scoring domain this skill rolls up to. */
  domain: string | null
  /** L2 taxonomy cluster — the bracket. */
  cluster: string | null
  /** How many of the user's skills share that cluster (never a global count). */
  clusterSize: number
  /** Gap row for this skill when one exists — carries live demand + honest lift. */
  gap: GapSkill | null
  /** Verbatim CV line that earned the level, or null when nothing proves it. */
  evidence: string | null
  sessionsToNext: number
  atMax: boolean
}

function findBucket(
  buckets: Record<string, UserSkillItem[]>,
  skillKey: string,
): { name: string; items: UserSkillItem[]; skill: UserSkillItem } | null {
  for (const [name, items] of Object.entries(buckets)) {
    const skill = items.find((item) => item.key === skillKey)
    if (skill) return { name, items, skill }
  }
  return null
}

/** Gap rows identify a skill by key OR display name depending on producer. */
function matchGap(gaps: GapSkill[], skill: UserSkillItem): GapSkill | null {
  const key = skill.key.toLowerCase()
  const name = skill.display_name.trim().toLowerCase()
  return gaps.find((g) => {
    const ref = g.skill.trim().toLowerCase()
    return ref === key || ref === name
  }) ?? null
}

export function buildSkillRoom(
  score: ScoreResponse,
  skills: UserSkillsByDomain,
  skillKey: string | null | undefined,
): SkillRoomModel | null {
  if (!skillKey) return null

  const inDomain = findBucket(skills.by_domain, skillKey)
  const inCluster = findBucket(skills.by_cluster, skillKey)
  const skill = inDomain?.skill ?? inCluster?.skill
  if (!skill) return null

  const level = skill.level
  return {
    skill,
    domain: inDomain?.name ?? null,
    cluster: inCluster?.name ?? null,
    clusterSize: inCluster?.items.length ?? 0,
    gap: matchGap(score.gap_skills, skill),
    evidence: skill.evidence_text?.trim() ? skill.evidence_text.trim() : null,
    sessionsToNext: sessionsToNextLevel(level, skill.forge_sessions_count),
    atMax: level >= MAX_LEVEL,
  }
}
