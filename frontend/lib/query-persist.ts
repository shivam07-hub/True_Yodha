import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister"
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client"

/**
 * Persists the TanStack Query cache to localStorage so a returning user paints
 * their last-known dashboard instantly (stale-while-revalidate) instead of
 * staring at a cold skeleton on every visit.
 *
 * Privacy: the cache holds the signed-in user's own data (profile, score,
 * matches). It is wiped on logout (see clearSessionTokens) so the next person
 * on a shared browser never inherits it. Only *successful* queries are written
 * — never an error or loading placeholder.
 */

/** localStorage key for the dehydrated cache. Wiped on logout. */
export const RQ_CACHE_KEY = "myro_rq_cache"

/**
 * Bumping this (via the env var, or the fallback) invalidates every persisted
 * cache — use it when a query's shape changes so old entries can't hydrate into
 * new code. Falls back to a static tag when the build var is absent.
 */
const CACHE_BUSTER = process.env.NEXT_PUBLIC_APP_VERSION ?? "rq-v1"

/** 24h: a returning user's cache is worth showing; older than a day, refetch. */
const MAX_AGE = 24 * 60 * 60 * 1000

/**
 * Returns persist options, or null on the server (no localStorage). Callers
 * fall back to a plain QueryClientProvider when null.
 */
export function makePersistOptions(): Omit<PersistQueryClientOptions, "queryClient"> | null {
  if (typeof window === "undefined") return null

  const persister = createSyncStoragePersister({
    storage: window.localStorage,
    key: RQ_CACHE_KEY,
    throttleTime: 1000,
  })

  return {
    persister,
    maxAge: MAX_AGE,
    buster: CACHE_BUSTER,
    dehydrateOptions: {
      // Never persist errors or pending queries — only good data is worth
      // restoring. A failed query must not hydrate as if it were valid.
      shouldDehydrateQuery: (query) => query.state.status === "success",
    },
  }
}
