const PREFIX = "myro_qcache_"

function tokenUserId(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]))
    return (payload.sub as string) ?? "anon"
  } catch {
    return "anon"
  }
}

export function cacheKey(parts: (string | null | undefined)[]): string {
  return PREFIX + parts.map((p) => p ?? "").join("|")
}

export function userCacheKey(token: string, parts: (string | null | undefined)[]): string {
  return cacheKey([tokenUserId(token), ...parts])
}

export async function withLocalCache<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const { ts, data } = JSON.parse(raw) as { ts: number; data: T }
      if (Date.now() - ts < ttlMs) return data
    }
  } catch {}
  const result = await fn()
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: result }))
  } catch {}
  return result
}

export function clearLocalCache(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {}
}
