/**
 * "Myro is updating your CV" — on the view the user is actually looking at.
 *
 * Myro does not backfill (`services/forward_pass`). A CV uploaded before a
 * capability existed is banked the first time its owner opens their CV. That
 * pass is enqueue-only and silent, and the live "Reading N additions" line it
 * feeds lives in <ReservoirProfile> — which only mounts on `/cv?view=stories`.
 * `/cv` opens on `view=cv`. So the work was happening on a tab nobody was on.
 *
 * This panel is that tab's missing half, and it does not stop at reporting.
 * The moment the stories land, the bullets missing their number ARE the
 * completion queue (#13 L3) — so the same <StoryQuestions> the Stories tab
 * shows is handed over right here, one question at a time. Answering banks an
 * inflow that folds into the same story; the CV line stays as one of its
 * phrasings. That is the loop closing where the user already is.
 *
 * Cost: one three-column poll while an ingest runs, stopping at zero. The full
 * profile read is fetched ONCE, after the pass finishes, under the same query
 * key the Stories tab uses — so switching tabs costs nothing and an answer
 * given here is already fresh there.
 */
"use client"

import { useRef } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { cv as cvApi } from "@/lib/api"
import { StoryQuestions } from "./story-questions"
import { forwardPassState } from "./forward-pass-state"
import "./forward-pass-panel.css"

export function ForwardPassPanel({ token }: { token: string }) {
  const queryClient = useQueryClient()

  const pollRef = useRef(false)
  const statusQuery = useQuery({
    queryKey: ["cv", "reservoirStatus"],
    queryFn: () => cvApi.career.reservoirStatus(token),
    refetchInterval: () => (pollRef.current ? 4000 : false),
  })

  // The expensive read, paid once and only after something actually landed.
  // Same key as <ReservoirProfile>: one cache, so an answer given here is
  // already true on the Stories tab and vice versa.
  const wants = forwardPassState(statusQuery.data, undefined).wantsProfile
  const profileQuery = useQuery({
    queryKey: ["cv", "careerProfile"],
    queryFn: () => cvApi.career.profile(token),
    enabled: wants,
  })

  const state = forwardPassState(statusQuery.data, profileQuery.data)
  pollRef.current = state.poll

  const refetch = () => {
    void queryClient.invalidateQueries({ queryKey: ["cv", "careerProfile"] })
    void queryClient.invalidateQueries({ queryKey: ["cv", "reservoirStatus"] })
  }

  if (state.mode === "working") {
    return (
      <section className="tm-fwp" aria-label="Myro is updating your CV">
        <p className="tm-fwp-live" role="status">
          <span className="tm-fwp-pulse" aria-hidden />
          Updating your CV — reading it into career stories.
        </p>
      </section>
    )
  }

  const profile = profileQuery.data
  // `landed` already implies a profile with stories in it; narrowing here rather
  // than asserting keeps that a fact the compiler checks instead of a promise.
  if (state.mode !== "landed" || !profile) return null

  return (
    <section className="tm-fwp" aria-label="What Myro added to your CV">
      <header className="tm-fwp-head">
        <p className="tm-fwp-kicker mono">Platform update</p>
        <h2 className="tm-fwp-title">
          Your CV is now {profile.story_count} career {profile.story_count === 1 ? "story" : "stories"}.
        </h2>
      </header>

      {/* Renders nothing of its own accord when there is nothing left to ask. */}
      <StoryQuestions
        token={token}
        questions={profile.questions}
        total={profile.questions_total}
        setAside={profile.questions_set_aside}
        missingNumber={profile.missing_number}
        missingStory={profile.missing_story}
        onChanged={refetch}
      />

      <Link href="/cv?view=stories" className="tm-fwp-link">All your stories</Link>
    </section>
  )
}
