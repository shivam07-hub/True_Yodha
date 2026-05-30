/**
 * Minimal SSE reader over fetch + ReadableStream (ADR-0009 PR2).
 *
 * EventSource is rejected — it is GET-only and cannot send the bearer auth
 * header. This reads a `text/event-stream` response and invokes `onEvent` for
 * every `data:` frame, ignoring `:`-comment heartbeats. The browser holds one
 * long-lived connection in place of the old short-poll loops.
 */

const BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  ""

export interface SseEvent {
  type: "token" | "phase" | "progress" | "done" | "error"
  [k: string]: unknown
}

/**
 * Open `path` (GET, bearer auth) and stream parsed events to `onEvent` until
 * the response closes. Throws on a non-OK response or a network error (callers
 * map that to a recoverable error state). Honours `signal` for cancellation.
 */
export async function readSse(
  path: string,
  token: string,
  onEvent: (ev: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
  if (!res.ok || !res.body) {
    throw new Error(`stream failed (${res.status})`)
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
      if (!frame.startsWith("data:")) continue // skip ": keepalive" comments
      const line = frame.slice(5).trim()
      if (!line) continue
      try {
        onEvent(JSON.parse(line) as SseEvent)
      } catch {
        // ignore malformed frame
      }
    }
  }
}
