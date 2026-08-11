export type BrowserAuthFlow = "implicit" | "pkce"
export type AuthCallbackFailure = "expired" | "failed"

const AUTH_CALLBACK_PATH = "/auth/callback"

/**
 * Myro receives two Supabase callback shapes on the same page:
 * - OAuth started by the browser returns `?code=` and needs PKCE.
 * - Server-minted magic links return `#access_token=` and need implicit flow.
 *
 * Supabase rejects a callback when the client's configured flow does not match
 * the URL, so select the flow before the singleton browser client initializes.
 */
export function authFlowTypeForUrl(href: string): BrowserAuthFlow {
  try {
    const url = new URL(href)
    if (url.pathname !== AUTH_CALLBACK_PATH) return "pkce"

    const fragment = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash)
    if (
      fragment.has("access_token") ||
      fragment.has("error") ||
      fragment.has("error_code") ||
      fragment.has("error_description")
    ) {
      return "implicit"
    }
  } catch {
    // A malformed location must not weaken the normal OAuth flow.
  }
  return "pkce"
}

export function authCallbackFailure(error: {
  code?: string | null
  message?: string | null
}): AuthCallbackFailure {
  const code = (error.code ?? "").toLowerCase()
  const message = (error.message ?? "").toLowerCase()
  return code.includes("expired") || message.includes("expired") ? "expired" : "failed"
}
