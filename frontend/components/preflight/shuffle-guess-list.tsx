"use client"

/**
 * Confirm-round guesses — shuffle-pinned layout (Watermelon UI pattern).
 *
 * Pin = yes / kept. The hero cycles pinned lines so several leanings stay
 * legible without a wall of rows. Reject and reword stay one tap away.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, MotionConfig, motion, type Transition } from "motion/react"
import { ChevronsUpDown, Pin } from "lucide-react"

import { Icon } from "@/components/cv/builder/icons"
import { SayPad } from "@/components/myro/say-pad"
import { SOURCE_LABEL, type OrderLine } from "@/lib/preflight/types"
import { cn } from "@/lib/utils"

import "./shuffle-guess-list.css"

const spring: Transition = { type: "spring", stiffness: 400, damping: 40 }

export function ShuffleGuessList({
  lines,
  onAnswer,
  onReword,
  busy,
}: {
  lines: OrderLine[]
  onAnswer: (lineId: string, status: "kept" | "dropped" | "unanswered") => void
  onReword: (lineId: string, text: string) => void
  busy?: boolean
}) {
  const kept = useMemo(() => lines.filter((l) => l.status === "kept"), [lines])
  const [heroIndex, setHeroIndex] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setHeroIndex((i) => Math.min(i, Math.max(kept.length - 1, 0)))
  }, [kept.length])

  useEffect(() => {
    if (editingId) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editingId])

  const hero = kept[heroIndex]

  const cycleHero = useCallback(() => {
    if (kept.length <= 1) return
    setHeroIndex((i) => (i + 1) % kept.length)
  }, [kept.length])

  function startReword(line: OrderLine) {
    setEditingId(line.id)
    setDraft(line.text)
  }

  function saveReword(lineId: string) {
    const text = draft.trim()
    if (!text) return
    setEditingId(null)
    onReword(lineId, text)
  }

  return (
    <MotionConfig transition={spring}>
      <div className="pf-shuffle">
        <AnimatePresence mode="popLayout">
          {kept.length > 0 && hero ? (
            <motion.div
              key="hero"
              layout
              initial={{ opacity: 0, scale: 0.96, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -8 }}
              className={cn("pf-shuffle-hero", kept.length > 1 && "is-clickable")}
              onClick={kept.length > 1 ? cycleHero : undefined}
              role={kept.length > 1 ? "button" : undefined}
              tabIndex={kept.length > 1 ? 0 : undefined}
              onKeyDown={
                kept.length > 1
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        cycleHero()
                      }
                    }
                  : undefined
              }
            >
              <Pin className="pf-shuffle-hero-pin" aria-hidden fill="currentColor" />
              <AnimatePresence mode="wait">
                <motion.div
                  key={hero.id}
                  className="pf-shuffle-hero-copy"
                  initial={{ opacity: 0, scale: 0.92, filter: "blur(6px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.92, filter: "blur(6px)" }}
                  transition={{ duration: 0.35, type: "spring", bounce: 0 }}
                >
                  <div className="pf-shuffle-hero-text">{hero.text}</div>
                  <div className="pf-guess-meta">
                    <span className="pf-source">{SOURCE_LABEL[hero.source]}</span>
                    {hero.source_note ? (
                      <span
                        className="pf-note"
                        data-tone={
                          hero.source === "user_reworded"
                            ? "reworded"
                            : hero.soft || hero.unusable
                              ? "soft"
                              : undefined
                        }
                      >
                        {hero.source_note}
                      </span>
                    ) : null}
                  </div>
                </motion.div>
              </AnimatePresence>
              {kept.length > 1 ? (
                <button
                  type="button"
                  className="pf-shuffle-hero-cycle tm-control-focus"
                  aria-label="Show next pinned line"
                  onClick={(e) => {
                    e.stopPropagation()
                    cycleHero()
                  }}
                >
                  <ChevronsUpDown size={18} aria-hidden />
                </button>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.ul layout className="pf-shuffle-list" aria-label="Myro inferred lines">
          {lines.map((line) => {
            const isHero = hero?.id === line.id
            const editing = editingId === line.id
            const answered = line.status !== "unanswered"
            const reworded = line.source === "user_reworded"
            const noteTone = reworded ? "reworded" : line.soft || line.unusable ? "soft" : undefined

            return (
              <motion.li
                layout
                key={line.id}
                className="pf-shuffle-item"
                data-status={line.status}
                data-highlight={isHero || undefined}
                role="group"
                aria-label={`${line.text} — ${SOURCE_LABEL[line.source]}`}
              >
                {editing ? (
                  <div className="pf-reword">
                    <SayPad
                      ref={inputRef}
                      className="pf-reword-input"
                      size="compact"
                      value={draft}
                      maxLength={240}
                      onChange={setDraft}
                      onSubmit={() => saveReword(line.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault()
                          setEditingId(null)
                          setDraft(line.text)
                        }
                      }}
                      aria-label="Reword this line"
                    />
                    <div className="pf-reword-actions">
                      <button
                        type="button"
                        className="pf-answer"
                        data-kind="yes"
                        onClick={() => saveReword(line.id)}
                      >
                        save · enter
                      </button>
                      <button
                        type="button"
                        className="pf-undo"
                        onClick={() => {
                          setEditingId(null)
                          setDraft(line.text)
                        }}
                      >
                        cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="pf-shuffle-item-main">
                      <button
                        type="button"
                        className={cn(
                          "pf-shuffle-pin tm-control-focus",
                          line.status === "kept" && "is-pinned",
                        )}
                        aria-label={
                          line.status === "kept"
                            ? `Unpin ${line.text}`
                            : line.unusable
                              ? `Cannot pin ${line.text}`
                              : `Pin ${line.text}`
                        }
                        disabled={busy || line.unusable || line.status === "dropped"}
                        onClick={() =>
                          onAnswer(line.id, line.status === "kept" ? "unanswered" : "kept")
                        }
                      >
                        <Pin size={18} aria-hidden fill={line.status === "kept" ? "currentColor" : "none"} />
                      </button>

                      <div className="pf-shuffle-item-copy">
                        <div className="pf-guess-text">{line.text}</div>
                        <div className="pf-guess-meta">
                          <span className="pf-source">{SOURCE_LABEL[line.source]}</span>
                          {line.source_note ? (
                            <span className="pf-note" data-tone={noteTone}>
                              {line.source_note}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="pf-shuffle-item-actions">
                        {answered ? (
                          <button
                            type="button"
                            className="pf-undo pf-undo-icon tm-control-focus"
                            aria-label="Undo"
                            onClick={() => onAnswer(line.id, "unanswered")}
                            disabled={busy}
                          >
                            <Icon name="undo" size={15} />
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="pf-answer tm-control-focus"
                              data-kind="no"
                              onClick={() => onAnswer(line.id, "dropped")}
                              disabled={busy}
                            >
                              no
                            </button>
                            <button
                              type="button"
                              className="pf-answer tm-control-focus"
                              data-kind="reword"
                              onClick={() => startReword(line)}
                              disabled={busy}
                            >
                              <Icon name="edit" size={13} /> reword
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </motion.li>
            )
          })}
        </motion.ul>
      </div>
    </MotionConfig>
  )
}
