"use client"

import * as React from "react"

/**
 * Client reader for the ADR-0009 progress-stream protocol (PR1: direct token
 * stream). Reads a `text/event-stream` POST via fetch + ReadableStream (not
 * EventSource — EventSource is GET-only and cannot carry the bearer header),
 * parses `data: {…}\n\n` frames, and smooths token bursts into a steady
 * typewriter reveal (~CPS chars/sec) for the Claude feel.
 *
 * Written against the full envelope (`token | phase | progress | done | error`)
 * so PR2's relay reuses it unchanged. PR1 surfaces only token/done/error.
 */

const BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  ""

const CPS = 55 // typewriter drain rate, chars/sec

export type StreamStatus = "idle" | "streaming" | "done" | "error"

export interface StreamEvent {
  type: "token" | "phase" | "progress" | "done" | "error"
  text?: string
  message?: string
  recoverable?: boolean
  [k: string]: unknown
}

export interface UseStreamingText {
  /** Typewriter-smoothed visible text. */
  text: string
  status: StreamStatus
  /** True while characters are still being revealed (drives the caret). */
  typing: boolean
  /** Whether the error state offers a retry. */
  recoverable: boolean
  /** POST `path` with bearer `token`, stream the response. onDone gets the terminal event. */
  start: (path: string, token: string, onDone?: (ev: StreamEvent) => void) => void
  reset: () => void
}

export function useStreamingText(): UseStreamingText {
  const [text, setText] = React.useState("")
  const [status, setStatus] = React.useState<StreamStatus>("idle")
  const [typing, setTyping] = React.useState(false)
  const [recoverable, setRecoverable] = React.useState(false)

  const targetRef = React.useRef("") // full text received so far
  const shownRef = React.useRef(0) // chars currently revealed
  const streamEndedRef = React.useRef(false)
  const rafRef = React.useRef<number | null>(null)
  const lastTsRef = React.useRef(0)
  const abortRef = React.useRef<AbortController | null>(null)

  const stopRaf = React.useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const drain = React.useCallback(
    (ts: number) => {
      if (lastTsRef.current === 0) lastTsRef.current = ts
      const dt = (ts - lastTsRef.current) / 1000
      lastTsRef.current = ts
      const target = targetRef.current

      if (shownRef.current < target.length) {
        const advance = Math.max(1, Math.round(CPS * dt))
        shownRef.current = Math.min(target.length, shownRef.current + advance)
        setText(target.slice(0, shownRef.current))
      }

      if (shownRef.current >= target.length && streamEndedRef.current) {
        rafRef.current = null
        setTyping(false)
        return
      }
      rafRef.current = requestAnimationFrame(drain)
    },
    [],
  )

  const ensureDrain = React.useCallback(() => {
    if (rafRef.current == null) {
      lastTsRef.current = 0
      setTyping(true)
      rafRef.current = requestAnimationFrame(drain)
    }
  }, [drain])

  const reset = React.useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    stopRaf()
    targetRef.current = ""
    shownRef.current = 0
    streamEndedRef.current = false
    lastTsRef.current = 0
    setText("")
    setTyping(false)
    setRecoverable(false)
    setStatus("idle")
  }, [stopRaf])

  const start = React.useCallback(
    (path: string, token: string, onDone?: (ev: StreamEvent) => void) => {
      reset()
      setStatus("streaming")
      const ctrl = new AbortController()
      abortRef.current = ctrl

      void (async () => {
        try {
          const res = await fetch(`${BASE}${path}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            signal: ctrl.signal,
          })
          if (!res.ok || !res.body) {
            streamEndedRef.current = true
            setStatus("error")
            setRecoverable(res.status >= 500 || res.status === 0)
            return
          }
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buf = ""
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            let idx: number
            while ((idx = buf.indexOf("\n\n")) !== -1) {
              const frame = buf.slice(0, idx)
              buf = buf.slice(idx + 2)
              const line = frame.startsWith("data:") ? frame.slice(5).trim() : frame.trim()
              if (!line) continue
              let ev: StreamEvent
              try {
                ev = JSON.parse(line) as StreamEvent
              } catch {
                continue
              }
              if (ev.type === "token" && ev.text) {
                targetRef.current += ev.text
                ensureDrain()
              } else if (ev.type === "done") {
                streamEndedRef.current = true
                ensureDrain()
                setStatus("done")
                onDone?.(ev)
              } else if (ev.type === "error") {
                streamEndedRef.current = true
                setStatus("error")
                setRecoverable(ev.recoverable !== false)
                onDone?.(ev)
              }
            }
          }
          streamEndedRef.current = true
          // Stream closed without an explicit done/error → settle whatever arrived.
          setStatus((s) => (s === "streaming" ? (targetRef.current ? "done" : "error") : s))
        } catch (e) {
          if ((e as Error)?.name === "AbortError") return
          streamEndedRef.current = true
          setStatus("error")
          setRecoverable(true)
        }
      })()
    },
    [ensureDrain, reset],
  )

  React.useEffect(
    () => () => {
      abortRef.current?.abort()
      stopRaf()
    },
    [stopRaf],
  )

  return { text, status, typing, recoverable, start, reset }
}
