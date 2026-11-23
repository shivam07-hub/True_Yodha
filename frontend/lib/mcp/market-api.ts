/**
 * The open MCP door's one way to reach the API (ARCHITECTURE_MCP.md §3A).
 *
 * Server-side only. Anonymous reads go out bare, like a visitor's browser;
 * keyed reads carry the door's own partner key (scope `market.read`), the
 * only secret the adapter holds. It is not a Supabase key and reaches no
 * person's data. A failure comes back as a value, never a throw, so a tool
 * can say what to try next instead of surfacing a stack.
 */

export type ApiOutcome<T> =
  | { ok: true; data: T }
  /** `status` 0 = the API did not answer (timeout or network). */
  | { ok: false; status: number; detail: string | null }

export interface MarketApi {
  read<T>(path: string, options?: { keyed?: boolean }): Promise<ApiOutcome<T>>
}

export interface MarketApiConfig {
  baseUrl: string
  partnerKey: string | undefined
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

// Under every Vercel function ceiling, so a slow read ends as a tool error the
// assistant can act on, not a platform timeout it cannot.
const DEFAULT_TIMEOUT_MS = 8_000
// The public aggregates are snapshots the API itself caches for 5 minutes
// (Cache-Control on /public/*); asking again inside that window buys nothing.
const ANONYMOUS_REVALIDATE_SECONDS = 300

function detailOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null
  const detail = (body as Record<string, unknown>).detail
  return typeof detail === "string" ? detail : null
}

export function createMarketApi(config: MarketApiConfig): MarketApi {
  const fetchImpl = config.fetchImpl ?? fetch
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const base = config.baseUrl.replace(/\/+$/, "")

  return {
    async read<T>(path: string, options?: { keyed?: boolean }): Promise<ApiOutcome<T>> {
      const keyed = options?.keyed ?? false
      if (!base || (keyed && !config.partnerKey)) {
        return { ok: false, status: 503, detail: null }
      }
      const headers: Record<string, string> = { Accept: "application/json" }
      if (keyed) headers.Authorization = `Bearer ${config.partnerKey}`

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let response: Response
      try {
        response = await fetchImpl(`${base}${path}`, {
          headers,
          signal: controller.signal,
          ...(keyed
            ? { cache: "no-store" as const }
            : { next: { revalidate: ANONYMOUS_REVALIDATE_SECONDS } }),
        })
      } catch {
        // Timeout or network: the API never answered, so there is no status
        // to report. The tool turns this into "try again shortly".
        return { ok: false, status: 0, detail: null }
      } finally {
        clearTimeout(timer)
      }
      // A proxy's HTML error page is not JSON; its status still says what failed.
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) return { ok: false, status: response.status, detail: detailOf(body) }
      if (body === null) return { ok: false, status: 502, detail: null }
      return { ok: true, data: body as T }
    },
  }
}
