import { ApiError, classifyError, readErrorCode, readTraceId } from "./api-error"

const DEFAULT_TIMEOUT_MS = 15_000

export type EnvLike = Record<string, string | undefined>

export type PublicReadOptions = {
  missing?: "throw" | "empty"
  timeoutMs?: number
  method?: string
  headers?: Record<string, string>
  body?: string
  next?: { revalidate?: number | false }
}

type PublicFetchInit = RequestInit & { next?: { revalidate?: number | false } }

export type PublicReadIo = {
  fetch?: (input: string, init?: PublicFetchInit) => Promise<Response>
  env?: EnvLike
}

/** Host the client actually fetches. Prefer BASE_URL — that is what CSP already allowed. */
export function publicApiHost(env: EnvLike = process.env): string {
  return (env.NEXT_PUBLIC_API_BASE_URL ?? env.NEXT_PUBLIC_API_URL ?? "").trim()
}

/** Every public FastAPI origin the browser may need. CSP and fetches share this list. */
export function publicApiConnectOrigins(env: EnvLike = process.env): string[] {
  const seen = new Set<string>()
  const origins: string[] = []
  for (const value of [env.NEXT_PUBLIC_API_BASE_URL, env.NEXT_PUBLIC_API_URL]) {
    const trimmed = value?.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    origins.push(trimmed)
  }
  return origins
}

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new DOMException("Timeout", "AbortError")),
    timeoutMs,
  )
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true })
  }
  return { signal: controller.signal, done: () => clearTimeout(timer) }
}

function extractError(body: unknown, status: number): string {
  if (typeof body !== "object" || body === null) return `HTTP ${status}`
  const detail = (body as Record<string, unknown>).detail
  if (typeof detail === "string") return detail
  if (detail && typeof detail === "object") {
    const message = (detail as Record<string, unknown>).message
    if (typeof message === "string") return message
  }
  return `HTTP ${status}`
}

/**
 * Unauthenticated FastAPI read. Callers pass a path and whether a 404 is empty.
 * Host, timeout, and error classification stay behind this interface.
 */
export async function publicRead<T>(
  path: string,
  opts: PublicReadOptions & { missing: "empty" },
  io?: PublicReadIo,
): Promise<T | null>
export async function publicRead<T>(
  path: string,
  opts?: PublicReadOptions,
  io?: PublicReadIo,
): Promise<T>
export async function publicRead<T>(
  path: string,
  opts: PublicReadOptions = {},
  io: PublicReadIo = {},
): Promise<T | null> {
  const host = publicApiHost(io.env)
  if (!host) {
    throw new ApiError("Public API host is not configured", { kind: "network" })
  }

  const method = (opts.method ?? "GET").toUpperCase()
  const headers: Record<string, string> = { ...opts.headers }
  if (opts.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json"
  }

  const { signal, done } = withTimeout(undefined, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const fetchImpl =
    io.fetch ??
    ((input: string, init?: PublicFetchInit) => globalThis.fetch(input, init))
  let res: Response
  try {
    const init: PublicFetchInit = { method, headers, body: opts.body, signal }
    if (opts.next) init.next = opts.next
    res = await fetchImpl(`${host}${path}`, init)
  } catch (err) {
    throw classifyError(err)
  } finally {
    done()
  }

  if (res.status === 404 && opts.missing === "empty") return null
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(extractError(body, res.status), {
      status: res.status,
      kind: "http",
      traceId: readTraceId(res, body),
      code: readErrorCode(body),
    })
  }
  if (res.status === 204) return null
  return (await res.json()) as T
}
