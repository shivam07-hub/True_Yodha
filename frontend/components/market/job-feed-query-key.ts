import type { FeedScope } from "@/lib/feed-scope"

/** The list is per-user and takes no parameters, so only identity and the saved
 *  location scope can change what comes back. Both view filters are applied to
 *  the cards in hand, so toggling one must not evict the cache and re-fetch —
 *  which is why they were never in this key even when they were server filters.
 */
export function jobFeedQueryKey({ token, scope }: { token: string; scope: FeedScope }) {
  return ["jobFeed", token, scope.signature] as const
}
