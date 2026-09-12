/**
 * Stories review space — the questions Myro cannot answer alone.
 *
 * The reservoir is the Master CV, so one achievement must be one story holding
 * every phrasing of it (ADR-0021). Myro folds what is plainly the same work
 * said twice; what is left is genuinely ambiguous — usually one piece of work
 * that is PART of another — and only the user knows. Those come here.
 *
 * One question at a time, both sides shown in full, with what Myro already did
 * beside it so nothing it merged is a silent mutation: every fold is listed and
 * every fold can be taken back.
 *
 * Nothing to ask and nothing done → the band renders nothing at all. An empty
 * queue is not a state worth a card.
 */
"use client"

import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { cv as cvApi } from "@/lib/api"
import { reviewState } from "./story-review-queue"
import { Button } from "@/components/ui/button"
import "./story-review.css"

const UNDO_SHOWN = 3

export function StoryReview({ token, onChanged }: { token: string; onChanged: () => void }) {
  const [cursor, setCursor] = useState(0)
  const review = useQuery({
    queryKey: ["cv", "storyReview"],
    queryFn: () => cvApi.career.review(token),
  })

  const settled = () => {
    setCursor(0)
    void review.refetch()
    onChanged()
  }

  const ruleStory = useMutation({
    mutationFn: ({ a, b, verdict }: { a: string; b: string; verdict: "merged" | "keep_separate" }) =>
      cvApi.career.storyVerdict(token, a, b, verdict),
    onSuccess: settled,
  })
  const ruleRole = useMutation({
    mutationFn: ({ a, b, verdict }: { a: string; b: string; verdict: "merged" | "keep_separate" }) =>
      cvApi.career.mergeVerdict(token, a, b, verdict),
    onSuccess: settled,
  })
  const undo = useMutation({
    mutationFn: ({ a, b }: { a: string; b: string }) => cvApi.career.storyUndo(token, a, b),
    onSuccess: settled,
  })

  const data = review.data
  const { hidden, waiting, at, pair, rolePair } = reviewState(data, cursor)
  if (!data || hidden) return null

  const stories = data.story_pairs
  const roles = data.role_pairs
  const folds = data.merged_for_you
  const failed = ruleStory.isError || ruleRole.isError || undo.isError

  return (
    <section className="tm-sri" aria-label="Duplicate review">
      <div className="tm-sri-rail">
        <p className="tm-sri-rail-head">To review</p>
        <p className={`tm-sri-count${stories.length ? " live" : ""}`}>
          <span>Same achievement?</span><span className="tm-sri-n">{stories.length}</span>
        </p>
        <p className={`tm-sri-count${roles.length ? " live" : ""}`}>
          <span>Same role?</span><span className="tm-sri-n">{roles.length}</span>
        </p>
        <p className="tm-sri-rail-head done">Done</p>
        <p className="tm-sri-count">
          <span>Merged for you</span><span className="tm-sri-n">{folds.length + data.tidied_roles}</span>
        </p>
        <p className="tm-sri-count">
          <span>You decided</span><span className="tm-sri-n">{data.you_decided}</span>
        </p>
      </div>

      <div className="tm-sri-main">
        {pair && (
          <>
            <h3 className="tm-sri-q">Same achievement, or part of it?</h3>
            <p className="tm-sri-of">{at + 1} of {waiting}</p>
            <div className="tm-sri-pair">
              {[pair.a, pair.b].map((side) => (
                <article key={side.id} className="tm-sri-side">
                  <p className="tm-sri-side-title">{side.title}</p>
                  <p className="tm-sri-side-role">
                    {side.role_label || "No role yet"}
                    {side.variant_count > 1 && ` · ${side.variant_count} phrasings`}
                  </p>
                  {side.pointer && <p className="tm-sri-side-line">{side.pointer}</p>}
                </article>
              ))}
            </div>
            <p className="tm-sri-rule">
              Merge if it is the same work said twice. Keep both if one is part of the other —
              a CV can use both lines.
            </p>
            <div className="tm-sri-actions">
              <Button
                size="sm"
                loading={ruleStory.isPending && ruleStory.variables?.verdict === "merged"}
                onClick={() => ruleStory.mutate({ a: pair.story_a, b: pair.story_b, verdict: "merged" })}
              >Same work — merge</Button>
              <Button
                size="sm" variant="neutral"
                loading={ruleStory.isPending && ruleStory.variables?.verdict === "keep_separate"}
                onClick={() => ruleStory.mutate({ a: pair.story_a, b: pair.story_b, verdict: "keep_separate" })}
              >Keep both</Button>
              {waiting > 1 && (
                <Button size="sm" variant="ghost" onClick={() => setCursor((c) => (c + 1) % waiting)}>
                  Later
                </Button>
              )}
            </div>
          </>
        )}

        {rolePair && (
          <>
            <h3 className="tm-sri-q">One role, written twice?</h3>
            <p className="tm-sri-of">{at + 1} of {waiting}</p>
            <div className="tm-sri-pair">
              {[rolePair.a_label, rolePair.b_label].map((label, i) => (
                <article key={i} className="tm-sri-side">
                  <p className="tm-sri-side-title">{label}</p>
                </article>
              ))}
            </div>
            <p className="tm-sri-rule">
              Merge when it is one job recorded twice. Keep separate for two real
              stints at the same employer.
            </p>
            <div className="tm-sri-actions">
              <Button
                size="sm"
                loading={ruleRole.isPending && ruleRole.variables?.verdict === "merged"}
                onClick={() => ruleRole.mutate({ a: rolePair.role_a, b: rolePair.role_b, verdict: "merged" })}
              >Merge</Button>
              <Button
                size="sm" variant="neutral"
                loading={ruleRole.isPending && ruleRole.variables?.verdict === "keep_separate"}
                onClick={() => ruleRole.mutate({ a: rolePair.role_a, b: rolePair.role_b, verdict: "keep_separate" })}
              >Keep separate</Button>
            </div>
          </>
        )}

        {waiting === 0 && <p className="tm-sri-clear">Nothing to review — every entry is its own.</p>}
        {failed && <p className="tm-sri-err" role="alert">That didn&apos;t save. Try again.</p>}

        {folds.length > 0 && (
          <div className="tm-sri-folds">
            <p className="tm-sri-folds-head">Merged for you</p>
            {folds.slice(0, UNDO_SHOWN).map((f) => (
              <p key={`${f.story_a}:${f.story_b}`} className="tm-sri-fold">
                <span className="tm-sri-fold-text">
                  <b>{f.merged}</b> into <b>{f.kept}</b>
                </span>
                <Button
                  size="sm" variant="ghost"
                  loading={undo.isPending && undo.variables?.a === f.story_a}
                  onClick={() => undo.mutate({ a: f.story_a, b: f.story_b })}
                >Undo</Button>
              </p>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
