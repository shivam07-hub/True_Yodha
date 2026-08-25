"use client"

import { useEffect, useState } from "react"

/**
 * The trailing edge of a fast-changing value — one primitive, three callers.
 *
 * A typeahead that puts its raw input straight into a TanStack `queryKey` fires
 * one request per keystroke. `/roles/families` did, and it cost 15 requests for
 * "financial analyst" at 4,253-9,191ms each on prod (ARCHITECTURE_READ_PATH.md
 * S16 P1). `use-global-job-search` already solved this inline; this is that same
 * timer, lifted so the next typeahead inherits it instead of re-deriving it.
 *
 * Debouncing the value — not the request — is deliberate: the key changes once,
 * so TanStack's cache and in-flight de-dupe see one entry per settled term
 * rather than one per prefix.
 */
export function useDebouncedValue<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])

  return debounced
}
