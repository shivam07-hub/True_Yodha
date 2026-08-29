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
    loading: query.isLoading,
  }
}

/* `can_open` / `blocked_reason` are deliberately NOT re-exported. They are the
   unlock moment (Job Tracks slice 3b), which is not built: `can_open` flips the
   moment the user tailors a CV for a job in their first search, and that is when
   the second one gets offered — not before. Exposing the gate with nothing
   reading it would be an API that looks answered and is not. `tracksApi.list`
   already returns both when 3b needs them. */
