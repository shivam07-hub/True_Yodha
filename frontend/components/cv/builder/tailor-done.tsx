"use client"

/**
 * The moment the loop closes — a CV tailored for a real job, saved.
 *
 * Extracted from `tailor-weave.tsx` because this panel now carries a second
 * thing: the offer of another search. Job Tracks slice 3b, and the handoff is
 * specific about the timing — `can_open` flips exactly here, and this is when
 * to offer, because the user has just felt the whole loop close and knows what
 * a search is FOR. Before this moment it is not advertised at all.
 *
 * The offer does not create anything. It opens Myro Search on the say band,
 * where the mentor turns "I'm also looking at marketing" into one typed
 * proposal the user answers — the path slice 2 built. Creating a track from a
 * button here would be inventing a search the user has not named, and a track
 * is the user's own words or it is nothing.
 */

import { useQueryClient } from "@tanstack/react-query"

import { trackKeys, useTracks } from "@/lib/hooks/use-tracks"
import { openRefreshGate } from "@/store/refreshGateStore"

/**
 * Re-read the Job Tracks gate after a tailored CV lands.
 *
 * The server stamps `tailored_cv_created_at` inside that same write, so
 * `can_open` has just flipped and the cached answer is now wrong. Without this
 * the offer below appears one tailor late — which for most users means never,
 * since the panel it lives on is the one they are looking at right now.
 */
export function useTailorGateRefresh(): () => void {
  const client = useQueryClient()
  return () => void client.invalidateQueries({ queryKey: trackKeys.all() })
}

export function TailorDone({
  token,
  company,
  savedVersion,
  onClose,
}: {
  token: string | null
  company: string
  /** null when the apply landed without returning an id — the copy stops
   *  promising a CV to open. */
  savedVersion: number | null
  onClose: () => void
}) {
  const { tracks, canOpen } = useTracks(token)
  // Offered while they do not yet have a second search, and never after. A
  // user who has one does not need telling it exists, and this is a success
  // screen — it must not become a place that nags.
  const offer = canOpen && tracks.length < 2

  return (
    <div className="tw-done">
      <div className="tw-done-badge">✓</div>
      <h2 className="tw-brief-h">Saved — your {company} CV</h2>
      <p className="tw-brief-p">
        Every line traces to your real experience. The stories you added are
        banked for every future job.
      </p>
      <button type="button" className="tw-btn tw-btn-primary" onClick={onClose}>
        {savedVersion != null ? "Open my CV" : "Done"}
      </button>

      {offer ? (
        <div className="tw-second">
          <p className="tw-second-p">
            Chasing a second kind of role? It gets its own matches and its own CV.
          </p>
          <button
            type="button"
            className="tw-btn tw-btn-ghost"
            onClick={() => {
              onClose()
              // The say band, not the slots: a second search starts as a
              // sentence about work they want, not as a form.
              openRefreshGate("say")
            }}
          >
            Add a search
          </button>
        </div>
      ) : null}
    </div>
  )
}
