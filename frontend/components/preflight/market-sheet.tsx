"use client"

/**
 * Surface B — the market bottom-sheet.
 *
 * Same order as the pre-flight gate, same query key, same mutations. A line the
 * user confirmed in pre-flight can be struck from here, and a line added here
 * shows up in the gate's brief under "added from the market sheet" without a
 * reload. That is the whole reason the order is a server record instead of two
 * components' local state.
 *
 * It is a LOOP, not a form: complaint → one proposed change → apply → receipt →
 * "anything else off?", indefinitely. Someone whose feed is wrong usually has
 * more than one reason, and a sheet that closes after the first fix makes them
 * re-open it to say the second thing.
 */

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"

import { Icon } from "@/components/cv/builder/icons"
import { preflight } from "@/lib/api"
import { invalidateTargetRoleData } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { countsFrom, orderSummaryFrom } from "@/lib/preflight/prose"
import { useOrder, useOrderMutations } from "@/lib/preflight/use-order"
import type { OrderProposal } from "@/lib/preflight/types"

import "./preflight.css"
import "./market-sheet.css"

const TOPICS = ["the work", "the place", "the level", "the pay", "something else"] as const

type Bubble = { kind: "myro" | "user" | "receipt"; text: string }

export function MarketSheet({
  open,
  onClose,
  /** How many jobs the feed is showing right now. The opener names it, and the
   *  receipt after an apply states what actually happened to it — a receipt that
   *  says "applied" without saying what changed is a receipt for nothing. */
  visibleCount,
  onExpand,
}: {
  open: boolean
  onClose: () => void
  visibleCount: number
  /** A widening change needs the newly in-scope roles rated, which the cached
   *  re-run cannot do. Hands off to the pre-flight's paid run. */
  onExpand?: () => void
}) {
  const { token } = useAuth()
  const client = useQueryClient()
  const { data: order } = useOrder(token, open)
  const { apply, undo } = useOrderMutations(token)

  const [trail, setTrail] = useState<Bubble[]>([])
  const [used, setUsed] = useState<string[]>([])
  const [pending, setPending] = useState<OrderProposal | null>(null)
  const [input, setInput] = useState("")
  const [thinking, setThinking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setTrail([{
      kind: "myro",
      text: visibleCount > 0
        ? `These ${visibleCount} aren't landing. What's off — the work itself, the place, or the level?`
        : "Nothing's landing. What's off — the work itself, the place, or the level?",
    }])
    setUsed([]); setPending(null); setInput(""); setThinking(false)
  }, [open, visibleCount])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [trail, pending])

  const counts = order ? countsFrom(order) : null
  const summary = order ? orderSummaryFrom(order) : ""

  async function propose(input: { topic?: string; free_text?: string }, said: string) {
    if (!token) return
    setTrail((t) => [...t, { kind: "user", text: said }])
    setPending(null)
    setThinking(true)
    try {
      const res = await preflight.proposals(token, input)
      const first = res.proposals[0]
      if (first) setPending(first)
      else setTrail((t) => [...t, { kind: "myro", text: "I can't turn that into a change yet — say it another way?" }])
    } catch {
      setTrail((t) => [...t, { kind: "myro", text: "Couldn't read that just then. Nothing changed — try again." }])
    } finally {
      setThinking(false)
    }
  }

  function pickTopic(topic: string) {
    if (topic === "something else") {
      // Doesn't propose — invites the composer. Guessing at a complaint the user
      // hasn't made yet is how a gripe about pay becomes a location filter.
      setTrail((t) => [...t, {
        kind: "myro",
        text: "Say it in your own words below — one thing at a time works best.",
      }])
      setUsed((u) => [...u, topic])
      return
    }
    setUsed((u) => [...u, topic])
    void propose({ topic }, TOPIC_SAID[topic] ?? topic)
  }

  async function applyPending() {
    if (!pending || !order) return
    const before = visibleCount
    const widened = pending.costly
    try {
      await apply.mutateAsync({ effects: pending.effects, origin: "market" })
      invalidateTargetRoleData(client) // re-runs the feed over what is already scored
      setTrail((t) => [...t, {
        kind: "receipt",
        text: widened
          ? `Applied · it's on your order now. Widening needs a fresh scan — starting one.`
          : `Applied · re-scoring the ${before} you can see. It's on your order now.`,
      }, { kind: "myro", text: "Anything else off?" }])
      setPending(null)
      if (widened) { onClose(); onExpand?.() }
    } catch {
      setTrail((t) => [...t, { kind: "myro", text: "That didn't save. Nothing changed — try again." }])
    }
  }

  if (!open || typeof document === "undefined") return null

  const topics = TOPICS.filter((t) => !used.includes(t))
  const costCaption = pending
    ? pending.costly
      ? "This widens the search, so it costs a run"
      : "Narrowing is free · widening costs a run"
    : null

  return createPortal(
    <div className="pf-sheet-scrim" onClick={onClose} role="presentation">
      <div
        className="pf-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Tell Myro what's off"
      >
        <div className="pf-sheet-head">
          <span className="pf-sheet-title">
            <Icon name="sparkle" size={16} /> Tell Myro what&apos;s off
          </span>
          <button type="button" className="pf-close tm-control-focus" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="pf-sheet-body" ref={scrollRef}>
          {/* The order first. A complaint needs something to be aimed at. */}
          <div className="pf-saved">
            <div className="pf-saved-head">
              <span className="pf-saved-eyebrow">Your order · saved in pre-flight</span>
              <span className="pf-saved-count">
                {counts && counts.kept > 0
                  ? `${counts.kept} line${counts.kept === 1 ? "" : "s"}${counts.fromMarket ? ` · ${counts.fromMarket} from here` : ""}`
                  : "no guesses confirmed yet"}
              </span>
            </div>
            <div className="pf-saved-prose">{summary || "Nothing on your order yet."}</div>

            {order && order.log.length > 0 ? (
              <div className="pf-changelog">
                {order.log.slice(-4).map((entry) => (
                  <div key={entry.id} className="pf-change" data-kind={entry.kind === "drop" ? "drop" : "add"}>
                    <span className="pf-change-sign" aria-hidden>{entry.kind === "drop" ? "−" : "+"}</span>
                    <span className="pf-change-text">{entry.text}</span>
                    <button
                      type="button"
                      className="pf-undo tm-control-focus"
                      onClick={() => {
                        undo.mutate(entry.id, {
                          onSuccess: () => setTrail((t) => [...t, {
                            kind: "myro",
                            text: `Undone — “${entry.text}” is off your order again.`,
                          }]),
                        })
                      }}
                    >
                      undo
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="pf-trail">
            {trail.map((b, i) => (
              <div key={i} className="pf-bubble" data-from={b.kind}>{b.text}</div>
            ))}
            {thinking ? (
              <div className="pf-thinking"><Loader2 size={13} className="animate-spin" /> thinking…</div>
            ) : null}
          </div>

          {pending ? (
            <div>
              <div className="pf-diff">
                <div className="pf-saved-eyebrow">One change to your saved order</div>
                {pending.effects.map((effect, i) => (
                  <div key={i} className="pf-diff-row" data-op={effect.op}>
                    <span className="pf-diff-sign" aria-hidden>{effect.op === "drop" ? "−" : "+"}</span>
                    <div>
                      <div className="pf-diff-text">{effect.text}</div>
                      <div className="pf-diff-label">{effect.label}</div>
                    </div>
                  </div>
                ))}
                <div className="pf-diff-why">{pending.why}</div>
                <div className="pf-diff-actions">
                  <button
                    type="button"
                    className="pf-apply tm-control-focus"
                    onClick={applyPending}
                    disabled={apply.isPending}
                  >
                    {pending.costly ? "Apply & re-run · 150" : "Apply & re-run · free"}
                  </button>
                  <button type="button" className="pf-undo tm-control-focus" onClick={() => setPending(null)}>
                    not that
                  </button>
                </div>
              </div>
              {costCaption ? <div className="pf-cost-caption">{costCaption}</div> : null}
            </div>
          ) : topics.length > 0 && !thinking ? (
            <div className="pf-topics">
              {topics.map((t) => (
                <button key={t} type="button" className="pf-topic tm-control-focus" onClick={() => pickTopic(t)}>
                  {t}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="pf-sheet-foot">
          <input
            className="pf-sheet-input"
            value={input}
            maxLength={600}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim() && !thinking) {
                e.preventDefault()
                const text = input.trim()
                setInput("")
                void propose({ free_text: text }, text)
              }
            }}
            placeholder="e.g. the pay is too low"
            aria-label="Tell Myro what's off"
          />
          <button
            type="button"
            className="pf-sheet-send tm-control-focus"
            disabled={!input.trim() || thinking}
            aria-label="Send"
            onClick={() => {
              const text = input.trim()
              if (!text) return
              setInput("")
              void propose({ free_text: text }, text)
            }}
          >
            <Icon name="arrow-right" size={16} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** What each chip means, in the user's voice. The chip is a shortcut for saying
 *  something, so the trail shows the sentence rather than the label. */
const TOPIC_SAID: Record<string, string> = {
  "the work": "too many big-corp roles",
  "the place": "I'd rather not commute across the city",
  "the level": "these are all too junior",
  "the pay": "the pay is too low",
}
