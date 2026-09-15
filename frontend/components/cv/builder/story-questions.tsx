/**
 * The standing completion queue — one bullet, one missing fact (#13 L3).
 *
 * A CV bullet is a summary of a summary, so the stories the upload bridge mints
 * arrive short of the one thing that makes a line land: the number. `story_depth`
 * decides that deterministically against the house standard the extractor already
 * writes to, and ADR-0016 forbids inventing the number — so the only repair is
 * to ask.
 *
 * The same question stands in the job room, on the weak requirement this bullet
 * is the evidence for. Answering in either place improves the SAME story, and
 * the story then leaves both queues because it is told and whole — not because
 * anything marked it answered.
 *
 * Some work genuinely has no number. "No number to give" is therefore a real
 * answer and not an evasion; without it this band would be a count that can
 * never reach zero. Set-aside is listed and reversible.
 *
 * Nothing to ask and nothing set aside → the band renders nothing at all.
 */
"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import type { StoryQuestion } from "@/lib/api"
import { cv as cvApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { canBank, questionsState } from "./story-questions-queue"
import "./story-questions.css"

export function StoryQuestions({
  token, questions, total, setAside, missingNumber, missingStory, onChanged,
}: {
  token: string
  questions: StoryQuestion[]
  total: number
  setAside: number
  /** Counted separately on the server: the two asks overlap, so one may not be
   *  derived from the other and the total. */
  missingNumber: number
  missingStory: number
  onChanged: () => void
}) {
  const [cursor, setCursor] = useState(0)
  const [draft, setDraft] = useState("")
  const [probe, setProbe] = useState<string | null>(null)

  const settled = () => {
    setCursor(0)
    setDraft("")
    setProbe(null)
    onChanged()
  }

  const answer = useMutation({
    mutationFn: ({ storyId, text, final }: { storyId: string; text: string; final: boolean }) =>
      cvApi.career.answerStory(token, storyId, text, final),
    onSuccess: (res) => {
      if (res.follow_up) setProbe(res.follow_up)
      else settled()
    },
  })
  const aside = useMutation({
    mutationFn: (storyId: string) => cvApi.career.setAsideStory(token, storyId, true),
    onSuccess: settled,
  })
  const reopen = useMutation({
    mutationFn: () => cvApi.career.reopenQuestions(token),
    onSuccess: settled,
  })

  const { hidden, at, question: q, canDefer } = questionsState(questions, setAside, cursor)
  if (hidden) return null

  const busy = answer.isPending || aside.isPending || reopen.isPending
  const failed = answer.error ?? aside.error ?? reopen.error

  return (
    <section className="tm-sqn" aria-label="Bullets to finish">
      <div className="tm-sqn-rail">
        <p className="tm-sqn-rail-head">Your bullets</p>
        <p className={`tm-sqn-count${missingNumber ? " live" : ""}`}>
          <span>Missing their number</span><span className="tm-sqn-n">{missingNumber}</span>
        </p>
        {missingStory > 0 && (
          <p className="tm-sqn-count live">
            <span>Missing the story</span><span className="tm-sqn-n">{missingStory}</span>
          </p>
        )}
        {setAside > 0 && (
          <>
            <p className="tm-sqn-rail-head done">Set aside</p>
            <p className="tm-sqn-count">
              <span>No number to give</span><span className="tm-sqn-n">{setAside}</span>
            </p>
            <Button
              size="sm" variant="ghost"
              loading={reopen.isPending}
              onClick={() => reopen.mutate()}
            >Ask me again</Button>
          </>
        )}
      </div>

      <div className="tm-sqn-main">
        {q ? (
          <>
            <h3 className="tm-sqn-q">{probe || q.prompt}</h3>
            <p className="tm-sqn-of">{at + 1} of {total}</p>

            <article className="tm-sqn-bullet">
              {q.role_label && <p className="tm-sqn-bullet-role">{q.role_label}</p>}
              <p className="tm-sqn-bullet-line">
                <span className="tm-sqn-diamond" aria-hidden>◆</span>
                {q.pointer || q.title}
              </p>
            </article>

            <label className="tm-sqn-label" htmlFor={`sqn-${q.story_id}`}>
              In your words
            </label>
            <textarea
              id={`sqn-${q.story_id}`}
              className="tm-sqn-composer"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="What you did, and what came of it."
              rows={3}
            />
            <p className="tm-sqn-hint mono">
              It improves this same story — your CV line stays as one of its phrasings.
            </p>

            <div className="tm-sqn-actions">
              <Button
                size="sm"
                disabled={!canBank(draft) || busy}
                loading={answer.isPending}
                onClick={() => answer.mutate({
                  storyId: q.story_id, text: draft.trim(), final: probe != null,
                })}
              >{probe ? "That's everything" : "Add it"}</Button>
              <Button
                size="sm" variant="neutral"
                disabled={busy}
                loading={aside.isPending}
                onClick={() => aside.mutate(q.story_id)}
              >No number to give</Button>
              {canDefer && (
                <Button
                  size="sm" variant="ghost" disabled={busy}
                  onClick={() => { setDraft(""); setProbe(null); setCursor((c) => c + 1) }}
                >Later</Button>
              )}
            </div>
          </>
        ) : (
          <p className="tm-sqn-clear">
            Every bullet is as whole as you can make it right now.
          </p>
        )}

        {failed && (
          <p className="tm-sqn-err" role="alert">
            {failed instanceof Error ? failed.message : "That didn't save. Try again."}
          </p>
        )}
      </div>
    </section>
  )
}
