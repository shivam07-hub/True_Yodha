"use client"

/**
 * Screen 2 — what Myro heard.
 *
 * Two bubbles and a card of proposed changes, each answerable on its own. The
 * point of the card is that Myro's reading of one sentence usually contains
 * three separate claims, and the user almost always agrees with some of them.
 * A single "does this look right?" forces an all-or-nothing answer to a mixed
 * bag, which is how a hard "no people management" ends up filed alongside a
 * guess about IC tracks and both survive.
 *
 * `Continue · drop N` states, on the button, what pressing it costs. Anything
 * unanswered is dropped — never quietly kept.
 */

import { Icon } from "@/components/cv/builder/icons"
import type { OrderProposal } from "@/lib/preflight/types"

import "./proposals.css"

export type ProposalAnswer = "kept" | "dropped"

export function ScreenProposals({
  said,
  reply,
  proposals,
  answers,
  onAnswer,
  onReword,
  rewording,
  onRewordOpen,
  onRewordClose,
  rewordDraft,
  onRewordDraft,
}: {
  said: string
  reply: string
  proposals: OrderProposal[]
  answers: Record<string, ProposalAnswer>
  onAnswer: (id: string, answer: ProposalAnswer | null) => void
  onReword: (id: string, text: string) => void
  rewording: string | null
  onRewordOpen: (id: string, current: string) => void
  onRewordClose: () => void
  rewordDraft: string
  onRewordDraft: (text: string) => void
}) {
  const answered = proposals.filter((p) => answers[p.id]).length
  const acceptedCount = proposals.filter((p) => answers[p.id] === "kept").length
  const unanswered = proposals.length - answered

  return (
    <>
      <div className="pf-trail">
        <div className="pf-bubble" data-from="user">{said}</div>
        <div className="pf-bubble" data-from="myro">{reply}</div>
      </div>

      <div className="pf-prop-card">
        {proposals.map((p) => {
          const answer = answers[p.id]
          const isRewording = rewording === p.id
          return (
            <div key={p.id} className="pf-prop" data-status={answer ?? "unanswered"}>
              <div className="pf-prop-main">
                <div className="pf-prop-copy">
                  <div className="pf-guess-eyebrow">{p.eyebrow}</div>
                  {isRewording ? (
                    <div className="pf-reword">
                      <input
                        className="pf-reword-input"
                        value={rewordDraft}
                        maxLength={240}
                        autoFocus
                        onChange={(e) => onRewordDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); onReword(p.id, rewordDraft.trim()) }
                          if (e.key === "Escape") { e.preventDefault(); onRewordClose() }
                        }}
                        aria-label={`Reword ${p.eyebrow}`}
                      />
                      <div className="pf-reword-actions">
                        <button
                          type="button"
                          className="pf-answer"
                          data-kind="yes"
                          onClick={() => onReword(p.id, rewordDraft.trim())}
                        >
                          save · enter
                        </button>
                        <button type="button" className="pf-undo" onClick={onRewordClose}>cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="pf-guess-text">{p.value}</div>
                      <div className="pf-guess-meta">
                        <span className="pf-note" data-tone={p.why.startsWith("reworded") ? "reworded" : undefined}>
                          {p.why}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {isRewording ? null : answer ? (
                  <div className="pf-answered" data-status={answer}>
                    <span>{answer === "kept" ? "✓ yes" : "✕ no"}</span>
                    <span aria-hidden>·</span>
                    <button type="button" className="pf-undo tm-control-focus" onClick={() => onAnswer(p.id, null)}>
                      undo
                    </button>
                  </div>
                ) : (
                  <div className="pf-answers">
                    <button
                      type="button" className="pf-answer tm-control-focus" data-kind="yes"
                      onClick={() => onAnswer(p.id, "kept")}
                    >
                      <Icon name="check" size={13} /> yes
                    </button>
                    <button
                      type="button" className="pf-answer tm-control-focus" data-kind="no"
                      onClick={() => onAnswer(p.id, "dropped")}
                    >
                      no
                    </button>
                    <button
                      type="button" className="pf-answer tm-control-focus" data-kind="reword"
                      onClick={() => onRewordOpen(p.id, p.value)}
                    >
                      <Icon name="edit" size={13} /> reword
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        <div className="pf-prop-foot">
          <span className="pf-drop-note">
            {unanswered > 0
              ? `${unanswered} unanswered — those get dropped`
              : `${acceptedCount} of ${proposals.length} accepted`}
          </span>
          {unanswered > 0 ? (
            <button
              type="button"
              className="pf-undo tm-control-focus"
              onClick={() => proposals.forEach((p) => { if (!answers[p.id]) onAnswer(p.id, "kept") })}
            >
              yes to all
            </button>
          ) : null}
        </div>
      </div>
    </>
  )
}
