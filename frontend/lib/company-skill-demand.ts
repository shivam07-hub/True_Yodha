import type { CompanySkillIntelligence } from "@/lib/api"

export type SkillDemandView =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "empty" }
  | { kind: "ready"; data: CompanySkillIntelligence }

function hasSkillDemand(data: CompanySkillIntelligence | null | undefined): data is CompanySkillIntelligence {
  return !!data && data.skills.length > 0
}

export function skillDemandView({
  fetching,
  error,
  data,
}: {
  fetching: boolean
  error: boolean
  data: CompanySkillIntelligence | null | undefined
}): SkillDemandView {
  if (hasSkillDemand(data)) return { kind: "ready", data }
  if (fetching) return { kind: "loading" }
  if (error) return { kind: "error" }
  return { kind: "empty" }
}
