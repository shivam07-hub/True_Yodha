import type { JobMatch } from "@/lib/api"

export interface NextMove {
  icon: "forge" | "cv" | "diary"
  title: string
  meta: string
  reward: string
  href?: string
  onClick?: () => void
  primary?: boolean
}

export interface NextMovesArgs {
  primaryJob: JobMatch | undefined
  hasForged: boolean
  cartSkillNames: string[]
  firstMissing: string | null
  loggedToday: boolean
  streak: number
  activeTargets: number
}

/**
 * The three "Next moves" on the Dashboard hero. Pure — derives a ranked,
 * deduped, capped-at-3 list from the user's current state. The first slot is
 * the primary (tailor the focused role); the rest fill from a fixed backlog of
 * loop-keeping nudges.
 */
export function buildNextMoves({
  primaryJob,
  hasForged,
  cartSkillNames,
  firstMissing,
  loggedToday,
  streak,
  activeTargets,
}: NextMovesArgs): NextMove[] {
  const moves: NextMove[] = []

  if (primaryJob) {
    moves.push({
      icon: "cv",
      title: `Tailor CV for ${primaryJob.company ?? primaryJob.title}`,
      meta: "Boost match → +18 Fit potential",
      reward: "+18 Fit",
      href: `/cv?jobId=${primaryJob.job_id}`,
      primary: true,
    })
  }
  if (!hasForged || cartSkillNames.length > 0) {
    const seedSkill = cartSkillNames[0] ?? firstMissing ?? "your next skill"
    moves.push({
      icon: "forge",
      title: `Practice ${seedSkill}`,
      meta: "L0 → L1 · 12 sessions",
      reward: "+30 XP",
      href: "/forge",
    })
  }
  if (!loggedToday) {
    moves.push({
      icon: "diary",
      title: "Log today's session",
      meta: `Streak ${streak} → ${streak + 1} days`,
      reward: "+10 XP",
      href: "/forge?diary=1",
    })
  }

  const addIfRoom = (move: NextMove) => {
    if (moves.length >= 3) return
    if (moves.some((m) => m.title === move.title)) return
    moves.push(move)
  }

  addIfRoom({
    icon: "cv",
    title: "Star one company hiring PMs",
    meta: "Builds your heatmap",
    reward: "Open",
    href: "/market",
  })
  addIfRoom({
    icon: "forge",
    title: "Read one skill gap",
    meta: "Open your weakest domain",
    reward: "Live Job Data",
    href: "/skills",
  })
  addIfRoom({
    icon: "diary",
    title: loggedToday ? "Review tracker follow-up" : "Log today's session",
    meta: loggedToday
      ? `${activeTargets} active target${activeTargets === 1 ? "" : "s"}`
      : `Streak ${streak} → ${streak + 1} days`,
    reward: loggedToday ? "Track" : "+10 XP",
    href: loggedToday ? "/tracker" : "/forge?diary=1",
  })

  return moves.slice(0, 3)
}
