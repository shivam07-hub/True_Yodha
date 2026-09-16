import type { ReachTargetStatus } from "@/lib/api"

export const REACH_STATUS_LABEL: Record<ReachTargetStatus, string> = {
  queued: "Queued",
  sent: "Sent",
  followed_up: "Followed up",
  replied: "Replied",
  stopped: "Stopped",
}

export function nextReachAction(
  status: ReachTargetStatus,
  due: boolean,
): { action: "sent" | "followed_up" | "replied"; label: string } | null {
  if (status === "queued") return { action: "sent", label: "Mark sent" }
  if (status === "sent" && due) return { action: "followed_up", label: "Mark followed up" }
  return null
}

export function reachCopy(person: {
  status: ReachTargetStatus
  due: boolean
  connect_note: string
  followup_note: string
  referral_ask: string
}): string {
  if (person.status === "queued") return person.connect_note
  if (person.due || person.status === "followed_up") return person.referral_ask
  return person.followup_note
}
