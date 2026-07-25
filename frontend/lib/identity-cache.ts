"use client"

// In-memory stale-while-revalidate cache for the identity/score path.
//
// A returning user should see last session's name + score instantly (<300ms,
// the LinkedIn pattern) instead of a blank nav that fills in ~1.3s after the
// authoritative fetch. Personal profile and score data deliberately never
// crosses into durable browser storage.

const PREFIX = "myro_identity_"
const snapshots = new Map<string, IdentitySnapshot<unknown>>()

function userId(token: string): string {
  try {
    return (JSON.parse(atob(token.split(".")[1])).sub as string) ?? "anon"
  } catch {
    return "anon"
  }
}

export interface IdentitySnapshot<T> {
  ts: number
  data: T
}

/** Last-known value for `kind` (e.g. "profile", "score"), scoped to the user. */
export function readIdentitySnapshot<T>(
  kind: string,
  token: string | null | undefined,
): IdentitySnapshot<T> | null {
  if (!token) return null
  return (snapshots.get(`${PREFIX}${kind}_${userId(token)}`) as IdentitySnapshot<T> | undefined) ?? null
}

/** Persist `data` as the last-known value for `kind` (scoped to the user). */
export function writeIdentitySnapshot<T>(
  kind: string,
  token: string | null | undefined,
  data: T,
): void {
  if (!token) return
  snapshots.set(`${PREFIX}${kind}_${userId(token)}`, { ts: Date.now(), data })
}
