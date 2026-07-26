/**
 * Typed transport error for the API client.
 *
 * The old code threw a bare `Error` whose message was either the backend
 * `detail` string OR `HTTP {status}` — so the status was *lost* whenever the
 * backend sent a detail body, and a network hang/timeout produced no error at
 * all (the request awaited forever → frozen skeleton). `ApiError` carries the
 * structured signal the failure UI needs: status, kind, and the server's
 * correlation ID for support lookups.
 */

import { FAILURE_COPY, type FailureKind } from "./failure-copy"

export type ApiErrorKind = "http" | "timeout" | "offline" | "network"

export class ApiError extends Error {
  /** HTTP status when `kind === "http"`, else null. */
  readonly status: number | null
  readonly kind: ApiErrorKind
  /** Server correlation id, surfaced to the user on 5xx for support. */
  readonly traceId: string | null
  /** Whether a retry could plausibly succeed (false for 401/403/404). */
  readonly retryable: boolean

  constructor(
    message: string,
    opts: { status?: number | null; kind: ApiErrorKind; traceId?: string | null; retryable?: boolean },
  ) {
    super(message)
    this.name = "ApiError"
    this.status = opts.status ?? null
    this.kind = opts.kind
    this.traceId = opts.traceId ?? null
    this.retryable = opts.retryable ?? defaultRetryable(opts.kind, opts.status ?? null)
  }
}

function defaultRetryable(kind: ApiErrorKind, status: number | null): boolean {
  if (kind === "offline" || kind === "timeout" || kind === "network") return true
  if (status === null) return true
  // 401 is recoverable only via re-login, not a blind retry. 403/404 won't change.
  if (status === 401 || status === 403 || status === 404) return false
  return status >= 500 || status === 429
}

/** Pull a server trace id from the response, tolerant of where it lands. */
export function readTraceId(res: Response, body: unknown): string | null {
  const header =
    res.headers.get("x-correlation-id") ??
    res.headers.get("x-trace-id") ??
    res.headers.get("x-request-id")
  if (header) return header
  if (body && typeof body === "object") {
    const correlationId = (body as Record<string, unknown>).correlation_id
    if (typeof correlationId === "string") return correlationId
    const top = (body as Record<string, unknown>).trace_id
    if (typeof top === "string") return top
    const detail = (body as Record<string, unknown>).detail
    if (detail && typeof detail === "object") {
      const nested = (detail as Record<string, unknown>).trace_id
      if (typeof nested === "string") return nested
    }
  }
  return null
}

/**
 * Normalize any thrown value into an ApiError. Classifies a fetch rejection
 * (the case the old code silently dropped): AbortError → timeout, offline
 * navigator → offline, TypeError("Failed to fetch") → network.
 */
export function classifyError(err: unknown): ApiError {
  if (err instanceof ApiError) return err

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return new ApiError("You appear to be offline.", { kind: "offline" })
  }
  if (err instanceof DOMException && err.name === "AbortError") {
    return new ApiError("Request timed out.", { kind: "timeout" })
  }
  if (err instanceof TypeError) {
    // fetch network failure (DNS, CORS, dropped connection, server unreachable)
    return new ApiError("Network request failed.", { kind: "network" })
  }
  const message = err instanceof Error ? err.message : "Unexpected error."
  return new ApiError(message, { kind: "network" })
}

/** Map a (possibly non-ApiError) failure to the copy bucket the UI renders. */
export function toFailureKind(err: unknown): FailureKind {
  const e = classifyError(err)
  if (e.kind === "offline" || e.kind === "network") return "offline"
  if (e.kind === "timeout") return "timeout"
  switch (e.status) {
    case 401:
      return "session"
    case 403:
      return "forbidden"
    case 404:
      return "notFound"
    case 429:
      return "rateLimited"
    default:
      return "server"
  }
}

/** Convenience: resolved copy + trace id for a failure, ready to render. */
export function describeFailure(err: unknown) {
  const e = classifyError(err)
  const kind = toFailureKind(e)
  return { kind, copy: FAILURE_COPY[kind], traceId: e.traceId, retryable: e.retryable }
}
