"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Send, Sparkles, X } from "lucide-react"

import { cv, jobs, mentor, type IntentChatMessage, type IntentFilterDiff } from "@/lib/api"
import { invalidateTargetRoleData } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"

const SEED: IntentChatMessage = {
  role: "assistant",
  content:
    "Not seeing the right roles? Tell me what you're really after — the kind of work, the place, or what's been off about what you've seen.",
}

function diffSummary(d: IntentFilterDiff): string[] {
  const parts: string[] = []
  if (d.add_roles.length) parts.push(`Add roles: ${d.add_roles.join(", ")}`)
  if (d.remove_roles.length) parts.push(`Drop roles: ${d.remove_roles.join(", ")}`)
  if (d.locations.length) parts.push(`Locations: ${d.locations.join(", ")}`)
  if (d.seniority) parts.push(`Seniority: ${d.seniority}`)
  if (d.work_mode) parts.push(`Work mode: ${d.work_mode}`)
  if (d.salary) parts.push(`Pay: ${d.salary}`)
  return parts
}

/**
 * Delta-4 intent chat. When the feed disappoints, the user talks to Myro instead
 * of dead-ending; Myro asks one thing at a time and, when it understands, proposes
 * a concrete filter change to one-tap confirm — then the feed re-runs. Not a form.
 *
 * `onExpand` (Backlog #36 N3, "want more" coin expansion): when the confirmed diff
 * WIDENS the search — adds roles or locations — applying it only re-runs the feed
 * over the *cached* match set; the newly in-scope jobs aren't rated yet. So we hand
 * off to the coin-charged expansion recompute (the existing MatchRefreshGate: free
 * when new jobs exist, else the 150-coin vanity charge) so the widened targeting
 * actually gets matched. A narrowing-only diff (dropping roles) needs no recompute —
 * the cached re-run is already correct, so `onExpand` is not fired.
 */
export function IntentChat({
  open,
  onClose,
  onExpand,
}: {
  open: boolean
  onClose: () => void
  onExpand?: () => void
}) {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  const [messages, setMessages] = useState<IntentChatMessage[]>([SEED])
  const [input, setInput] = useState("")
  const [diff, setDiff] = useState<IntentFilterDiff | null>(null)
  const [applied, setApplied] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // Latest messages, read by the capture path (avoids stale-closure in the
  // apply mutation's onSuccess + the close handler).
  const messagesRef = useRef(messages)
  const capturedRef = useRef(false)
  useEffect(() => { messagesRef.current = messages }, [messages])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [input])

  useEffect(() => {
    if (open) {
      setMessages([SEED])
      setInput("")
      setDiff(null)
      setApplied(false)
      capturedRef.current = false
    }
  }, [open])

  // Every "Tell Myro" session the user typed into is his own words about the job
  // he wants → dump it into the one notebook reservoir (source job_intent) so it's
  // visible in /notebook + fed to distillation → user_memory → the brain
  // everywhere, EVEN when he never confirmed a filter change. Best-effort: never
  // blocks or errors the close.
  function captureToNotebook() {
    if (capturedRef.current || !token) return
    const turns = messagesRef.current
      .filter((m) => m.role === "user")
      .map((m) => m.content.trim())
      .filter(Boolean)
    if (turns.length === 0) return
    capturedRef.current = true
    cv.dump.add(token, turns.join("\n\n"), "job_intent").catch(() => {})
  }

  function handleClose() {
    captureToNotebook()
    onClose()
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, diff])

  const chat = useMutation({
    // One endpoint, one context assembly, one voice — the bottom sheet stays its
    // own presentation because it does a different job from the pre-flight panel
    // (it APPLIES and re-runs the feed; that one only proposes into a draft).
    mutationFn: (next: IntentChatMessage[]) => mentor.converse(token!, "job_intent", next),
    onSuccess: (res) => {
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }])
      setDiff(res.proposed_diff)
    },
  })

  const apply = useMutation({
    mutationFn: (d: IntentFilterDiff) => jobs.applyIntentDiff(token!, d),
    onSuccess: (_res, d) => {
      invalidateTargetRoleData(queryClient) // re-runs the feed + score with new filters
      setApplied(true)
      // Widened the search → the newly in-scope jobs need rating; hand off to the
      // coin-charged expansion recompute after the "Updated" beat. Narrowing only
      // (removed roles) is fully served by the cached re-run above — no charge.
      const widened = d.add_roles.length > 0 || d.locations.length > 0
      setTimeout(() => {
        handleClose()
        if (widened) onExpand?.()
      }, 1100)
    },
  })

  function send() {
    const text = input.trim()
    if (!text || chat.isPending) return
    const next = [...messages, { role: "user" as const, content: text }]
    setMessages(next)
    setInput("")
    setDiff(null)
    chat.mutate(next)
  }

  if (!open || typeof document === "undefined") return null

  // Portalled to <body> — on mobile this dialog is opened from inside <main>
  // (app-shell.tsx), which sets z-index:2 and traps any in-tree fixed-position
  // z-index below the bottom nav's z-index:30 in the real root stacking
  // context. Without the portal, the footer input row renders behind the nav.
  return createPortal(
    <div
      role="dialog"
      aria-label="Talk to Myro about your job search"
      style={{
        position: "fixed", inset: 0, zIndex: 500, display: "flex",
        alignItems: "flex-end", justifyContent: "center",
        background: "var(--tm-scrim, rgba(0,0,0,0.5))",
      }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480, maxHeight: "80vh", display: "flex", flexDirection: "column",
          background: "var(--tm-surface)", border: "1px solid var(--tm-border-soft)",
          borderRadius: "var(--tm-radius-lg) var(--tm-radius-lg) 0 0", overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--tm-border-soft)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14, color: "var(--tm-text)" }}>
            <Sparkles size={16} style={{ color: "var(--tm-interactive)" }} /> Tell Myro what you want
          </span>
          <button type="button" onClick={handleClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tm-text-muted)" }}>
            <X size={18} />
          </button>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%", padding: "9px 12px", borderRadius: 14, fontSize: 13.5, lineHeight: 1.5,
                background: m.role === "user" ? "var(--tm-interactive)" : "var(--tm-int-bg-wash)",
                color: m.role === "user" ? "var(--tm-on-accent, #fff)" : "var(--tm-text)",
              }}
            >
              {m.content}
            </div>
          ))}
          {chat.isPending && (
            <div style={{ alignSelf: "flex-start", color: "var(--tm-text-faint)", fontSize: 12, display: "inline-flex", gap: 6, alignItems: "center" }}>
              <Loader2 size={13} className="animate-spin" /> thinking…
            </div>
          )}

          {diff && !applied && (
            <div style={{ alignSelf: "stretch", marginTop: 4, padding: 12, borderRadius: 12, border: "1px solid var(--tm-int-border)", background: "var(--tm-int-bg-wash)" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--tm-text-faint)", marginBottom: 6 }}>Proposed change</div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, color: "var(--tm-text)", display: "flex", flexDirection: "column", gap: 3 }}>
                {diffSummary(diff).map((p) => <li key={p}>{p}</li>)}
              </ul>
              <button
                type="button"
                onClick={() => apply.mutate(diff)}
                disabled={apply.isPending}
                style={{
                  marginTop: 10, width: "100%", padding: "9px 12px", borderRadius: 10, border: "none",
                  background: "var(--tm-interactive)", color: "var(--tm-on-accent, #fff)", fontWeight: 600,
                  fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                {apply.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                Apply &amp; refresh my matches
              </button>
            </div>
          )}

          {applied && (
            <div style={{ alignSelf: "stretch", textAlign: "center", fontSize: 13, color: "var(--tm-success)", padding: 8 }}>
              Updated — refreshing your matches…
            </div>
          )}
        </div>

        {!applied && (
          <div style={{ display: "flex", gap: 8, padding: "12px 12px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--tm-border-soft)", alignItems: "flex-end" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="e.g. remote product roles, not consulting"
              aria-label="Your message"
              rows={1}
              style={{
                flex: 1, padding: "9px 12px", borderRadius: 10, border: "1px solid var(--tm-border-soft)",
                background: "var(--tm-bg)", color: "var(--tm-text)", fontSize: 13.5, fontFamily: "inherit",
                lineHeight: 1.5, outline: "none", resize: "none", minHeight: 40, maxHeight: 140,
                overflowY: "auto",
              }}
            />
            <button
              type="button" onClick={send} disabled={!input.trim() || chat.isPending} aria-label="Send"
              style={{ flexShrink: 0, height: 40, padding: "0 14px", borderRadius: 10, border: "none", background: "var(--tm-interactive)", color: "var(--tm-on-accent, #fff)", cursor: "pointer" }}
            >
              <Send size={16} />
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
