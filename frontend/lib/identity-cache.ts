"use client"

// Stale-while-revalidate persistence for the identity/score path (#41 L2).
//
// A returning user should see last session's name + score instantly (<300ms,
// the LinkedIn pattern) instead of a blank nav that fills in ~1.3s after the
// authoritative fetch. We stash the last-seen value per user in localStorage
// and feed it back as React Query `initialData` (with the old timestamp, so the
// query still treats it as stale and refetches in the background). The coins
// balance already does this via zustand-persist; this covers profile + score.

const PREFIX = "myro_identity_"

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
  if (!token || typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(`${PREFIX}${kind}_${userId(token)}`)
    return raw ? (JSON.parse(raw) as IdentitySnapshot<T>) : null
  } catch {
    return null
  }
}

/** Persist `data` as the last-known value for `kind` (scoped to the user). */
export function writeIdentitySnapshot<T>(
  kind: string,
  token: string | null | undefined,
  data: T,
): void {
  if (!token || typeof window === "undefined") return
  try {
    localStorage.setItem(
      `${PREFIX}${kind}_${userId(token)}`,
      JSON.stringify({ ts: Date.now(), data }),
    )
  } catch {}
}
