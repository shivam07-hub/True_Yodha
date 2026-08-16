"use client"

import { useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Loader2, Send, Sparkles } from "lucide-react"

import {
  mentor,
  type IntentChatMessage,
  type IntentFilterDiff,
  type MentorSurface,
} from "@/lib/api"
import { SayPad } from "@/components/myro/say-pad"

/**
 * Talking to Myro. One component, whichever screen you are on.
 *
 * It replaced two: the pre-flight's panel and the market's modal. They were not
 * duplicates — one proposes into a draft and never writes, the other applies and
 * re-runs the feed — but everything up to the outcome WAS the same, twice: the
 * transcript, the composer, the pending state, the failure line. Two copies of a
 * conversation is how one of them ends up warmer than the other and the user
 * meets two Myros.
 *
 * So this owns the conversation and nothing else. What happens with a proposal
 * belongs to the surface that can accept it, which is why `onPropose` hands the
 * diff straight out and this file has no idea what a filter is.
 *
 * `surface` goes to the server, which decides whether a proposal is even
 * possible there — a diff on the CV screen is a change with no button, so it
 * never arrives. See backend `mentor.py`.
 *
 * Nothing here persists. The turn is logged and learned from server-side, off
 * the response path; every write the user can see still belongs to the surface's
 * own commit point, so a modal's Discard still means discard.
 */

export function MyroChat({
  token,
  surface,
  seed,
  placeholder = "Say it however you'd say it out loud",
  heading = "Tell Myro what you want",
  maxHeightClass = "max-h-52",
  onPropose,
  onReplied,
}: {
  token: string | null
  surface: MentorSurface
  /** Myro's opening line. Surface-specific: it is the only part of the
   *  conversation that knows where it is happening. */
  seed: string
  placeholder?: string
  heading?: string
  maxHeightClass?: string
  /** A proposal the surface can accept. Only ever fires where the server allows
   *  one, so a caller without an accept path can simply omit it. */
  onPropose?: (diff: IntentFilterDiff) => void
  /** Every completed turn, for surfaces that track the transcript themselves. */
  onReplied?: (messages: IntentChatMessage[]) => void
}) {
  const [messages, setMessages] = useState<IntentChatMessage[]>([
    { role: "assistant", content: seed },
  ])
  const [input, setInput] = useState("")
  const listRef = useRef<HTMLDivElement>(null)

  const send = useMutation({
    mutationFn: (next: IntentChatMessage[]) => mentor.converse(token!, surface, next),
    onSuccess: (res, next) => {
      const withReply: IntentChatMessage[] = [...next, { role: "assistant", content: res.reply }]
      setMessages(withReply)
      if (res.proposed_diff && onPropose) onPropose(res.proposed_diff)
      onReplied?.(withReply)
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
      })
    },
  })

  function submit() {
    const text = input.trim()
    if (!text || !token || send.isPending) return
    const next: IntentChatMessage[] = [...messages, { role: "user", content: text }]
    setMessages(next)
    setInput("")
    send.mutate(next)
  }

  return (
    <div className="rounded-lg border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-4">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[var(--tm-text)]">
        <Sparkles size={15} style={{ color: "var(--tm-interactive)" }} />
        {heading}
      </div>
      <div ref={listRef} className={`${maxHeightClass} space-y-2.5 overflow-y-auto pr-1`}>
        {messages.map((m, i) => (
          <p
            key={i}
            className={
              m.role === "assistant"
                ? "text-pretty text-sm leading-6 text-[var(--tm-text)]"
                : "text-pretty text-sm leading-6 text-[var(--tm-text-muted)]"
            }
          >
            {m.content}
          </p>
        ))}
        {send.isPending && (
          <p className="flex items-center gap-1.5 text-sm text-[var(--tm-text-muted)]">
            <Loader2 size={13} className="animate-spin" /> Thinking…
          </p>
        )}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <SayPad
          value={input}
          onChange={setInput}
          onSubmit={submit}
          maxLength={600}
          placeholder={placeholder}
          aria-label={heading}
          className="rounded-md border border-[var(--tm-border-soft)] bg-transparent text-sm text-[var(--tm-text)]"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!input.trim() || send.isPending}
          aria-label="Send"
          className="tm-control-focus inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-[var(--tm-border-soft)] disabled:opacity-40"
        >
          <Send size={15} />
        </button>
      </div>
      {send.isError && (
        <p role="alert" className="mt-2 text-sm text-[var(--tm-danger)]">
          Myro couldn&apos;t reply just then. Nothing you&apos;ve entered has changed — try again.
        </p>
      )}
    </div>
  )
}
