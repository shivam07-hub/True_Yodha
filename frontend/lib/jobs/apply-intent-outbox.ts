import type { ApplyIntentInput } from "@/lib/api"

export interface ApplyIntentEvent extends ApplyIntentInput {
  job_id: string
}

export interface ApplyIntentStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const MAX_EVENTS = 100

export function applyIntentOutboxKey(token: string): string {
  let hash = 2166136261
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `myro.apply-intent-outbox.v1.${(hash >>> 0).toString(36)}`
}

export function readApplyIntentOutbox(
  storage: ApplyIntentStorage,
  key: string,
): ApplyIntentEvent[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? "[]")
    return Array.isArray(parsed) ? parsed.filter(isApplyIntentEvent) : []
  } catch {
    return []
  }
}

export function enqueueApplyIntent(
  storage: ApplyIntentStorage,
  key: string,
  event: ApplyIntentEvent,
): void {
  const current = readApplyIntentOutbox(storage, key).filter(
    item => item.client_event_id !== event.client_event_id,
  )
  storage.setItem(key, JSON.stringify([...current, event].slice(-MAX_EVENTS)))
}

export async function flushApplyIntentOutbox(
  storage: ApplyIntentStorage,
  key: string,
  send: (event: ApplyIntentEvent) => Promise<unknown>,
): Promise<void> {
  const delivered = new Set<string>()
  for (const event of readApplyIntentOutbox(storage, key)) {
    try {
      await send(event)
      delivered.add(event.client_event_id)
    } catch {
      // Keep the attempt for the next mount or online event.
    }
  }
  const current = readApplyIntentOutbox(storage, key)
  storage.setItem(
    key,
    JSON.stringify(current.filter(event => !delivered.has(event.client_event_id))),
  )
}

function isApplyIntentEvent(value: unknown): value is ApplyIntentEvent {
  if (!value || typeof value !== "object") return false
  const event = value as Partial<ApplyIntentEvent>
  return (
    typeof event.client_event_id === "string" &&
    typeof event.job_id === "string" &&
    typeof event.surface === "string" &&
    (event.destination_type === "direct_role" || event.destination_type === "career_search")
  )
}
