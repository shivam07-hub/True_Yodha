"use client"

/**
 * The user's searches — one read, shared by every surface that needs them.
 *
 * `tracks[0]` is always the profile track: no row, no id, `is_profile: true`.
 * A caller never reads the profile and the `job_tracks` table separately and
 * stitches them, which is the whole reason `tracks_for` exists server-side.
 *
 * Cheap and stable: a track is opened deliberately and almost never changes, so
 * this is cached for the session rather than re-read per surface. It must not
 * become a second J0 read — the feed groups by `track_id`, which the FEED
 * already carries; this supplies only the WORDS and the gate.
 */

import { useQuery } from "@tanstack/react-query"

import { tracks as tracksApi } from "@/lib/api"

export const trackKeys = {
  all: () => ["tracks"] as const,
}

export function useTracks(token: string | null, enabled = true) {
  const query = useQuery({
    queryKey: trackKeys.all(),
    queryFn: () => tracksApi.list(token!),
    enabled: enabled && !!token,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
  return {
    /** Empty until it lands. Every consumer must render correctly with none —
     *  a single-track user's screen has no track chrome anyway, so "not loaded"
     *  and "one search" are deliberately the same picture. */
    tracks: query.data?.tracks ?? [],
    /** Has this user earned another search? False until they have tailored a CV
     *  for a job in their first one — the moment the whole loop closes. Read by
     *  the tailor's done panel and nothing else: before that moment the second
     *  search is not advertised at all. */
    canOpen: query.data?.can_open ?? false,
    loading: query.isLoading,
  }
}

/* `blocked_reason` is deliberately not re-exported. Nothing renders a refusal
   yet, and when something does it must render THAT STRING — never a padlock,
   never "Pro", never the word "locked". There is a server test asserting the
   reason never contains it, and the UI must not say what the API refuses to. */
