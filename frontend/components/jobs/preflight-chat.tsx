"use client"

import { useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { Loader2, Send, Sparkles } from "lucide-react"

import { jobs, type IntentChatMessage, type IntentFilterDiff } from "@/lib/api"

/**
 * The conversation at the top of Myro Search — the pre-flight's PRIMARY input.
 *
 * The modal used to be seven typed rows. Someone who cannot phrase a dealbreaker
 * as a chip types "dfsdkl", and that reaches the matcher as truth. The concierge
 * that fixes this already existed and already read memory and career stories — it
 * was just mounted only on the DISAPPOINTMENT path (feed empty, "Not it?"), never
 * on the screen where the user is actively declaring what they want.
 *
 * Two contracts, both deliberate:
 *
 * 1. **Chat proposes; the rows are its receipt.** Myro talks first, the rows
 *    below show what it HEARD, and they stay editable. The manifest is not the
 *    input any more — it is the confirmation, which is what makes the run legible
 *    before coins are spent.
 * 2. **Nothing persists here.** `onPropose` fills the modal's DRAFT only. Unlike
 *    the feed's copy of this concierge, this one never calls
 *    `/jobs/intent-chat/apply` — the modal's three exits (Run / Save targeting
 *    only / Discard) stay the single commit point, so the distiller's
 *    propose-only lock on profile columns holds and Discard still means discard.
 *
 * A separate component because MatchRefreshGate is already 600+ lines, and
 * because the thing that must not drift is this file's refusal to write.
 */

const SEED: IntentChatMessage = {
  role: "assistant",
  content:
    "Tell me what you're after — the kind of work, where, and anything you won't accept. I'll set the search up from that.",
}

export function PreflightChat({
  token,
  onPropose,
}: {
  token: string | null
  /** Fills the modal's DRAFT. Never persists — the modal owns the commit. */
  onPropose: (diff: IntentFilterDiff) => void
}) {
  const [messages, setMessages] = useState<IntentChatMessage[]>([SEED])
  const [input, setInput] = useState("")
  const listRef = useRef<HTMLDivElement>(null)

  const send = useMutation({
    mutationFn: (next: IntentChatMessage[]) => jobs.intentChat(token!, next),
    onSuccess: (res, next) => {
      setMessages([...next, { role: "assistant", content: res.reply }])
      // Straight into the draft. The user sees the rows below change and can edit
      // or discard — no write has happened.
      if (res.proposed_diff) onPropose(res.proposed_diff)
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
        Tell Myro what you want
      </div>
      <div ref={listRef} className="max-h-52 space-y-2.5 overflow-y-auto pr-1">
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
      <div className="mt-3 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Say it however you'd say it out loud"
          aria-label="Tell Myro what you want"
          className="tm-control-focus min-h-10 flex-1 rounded-md border border-[var(--tm-border-soft)] bg-transparent px-3 text-sm text-[var(--tm-text)]"
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
          Myro couldn&apos;t reply just then. Your inputs below are untouched — edit them directly, or try again.
        </p>
      )}
    </div>
  )
}
