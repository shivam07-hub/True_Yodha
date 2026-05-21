export interface CartSkill {
  skill_name: string
  level_from: number
  level_to: number
  company?: string
}

export interface ForgeSessionResult {
  xp_earned: number
  new_xp_balance: number
  level_before: number
  level_after: number
  leveled_up: boolean
  sessions_toward_next: number
  sessions_needed: number | null
  total_forge_minutes?: number
  minutes_to_next_session?: number
}

export interface XPSpendResult {
  balance: number
}
