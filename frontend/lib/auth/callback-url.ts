import { appendAttributionToUrl } from "@/lib/attribution"
import type { AuthMethod } from "@/lib/auth/last-auth"

/** Query param naming the method that STARTED this sign-in. */
export const AUTH_METHOD_PARAM = "m"

export type StartableAuthMethod = Exclude<AuthMethod, "partner">

/**
 * The callback URL, carrying the method that sent the user there.
 *
 * The session cannot answer "which provider did they just use": Supabase's
 * `app_metadata.provider` holds the FIRST provider the account ever used, the
 * identities list is ordered by creation, and `identities[].last_sign_in_at`
 * was observed stale (a Google sign-in on 2026-09-05 still read 2026-04-22).
 * So a user with both an email and a Google identity was recorded as
 * "magic_link" no matter which button they actually pressed. Only the caller
 * knows, so the caller says so.
 *
 * Never `via` — the callback reads that as partner SSO.
 */
export function authCallbackUrl(method: StartableAuthMethod, origin: string): string {
  const url = new URL("/auth/callback", origin)
  url.searchParams.set(AUTH_METHOD_PARAM, method)
  return appendAttributionToUrl(url.toString())
}
