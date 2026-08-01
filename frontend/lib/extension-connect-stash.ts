/**
 * Extension-connect stash — bridges "the Chrome extension opened the connect
 * handshake while the visitor was logged out" to the post-login account.
 * Third carried-intent lane, mirroring the anon-CV claim and the anon job save.
 *
 * The handshake used to bounce through `/login?next=/extension/connect?...`,
 * but postAuthDestination has always discarded `?next=`, so the visitor landed
 * on /market and had to re-open the extension link. Nothing signalled that —
 * the dead `next` plumbing made the return hop look implemented (deleted
 * 2026-08-01). Holding the redirect_uri here is what actually carries it.
 *
 * SECURITY: only a value that already matches EXTENSION_REDIRECT_RE is ever
 * stored, so a crafted `?redirect_uri=https://evil.example` cannot survive auth
 * and be handed a token. The connect page re-validates on arrival regardless —
 * this stash is not the only gate, and must never become it.
 */

/** Chrome extension IDs are exactly 32 chars a–p; getRedirectURL() returns
 *  `https://<id>.chromiumapp.org/`. Single source — the connect page imports it. */
export const EXTENSION_REDIRECT_RE = /^https:\/\/[a-p]{32}\.chromiumapp\.org\/?$/

const KEY = "myro_pending_ext_connect_v1"

/** Stash the handshake target before bouncing a logged-out visitor to /login.
 *  Rejects anything that is not a chrome-extension redirect host. */
export function stashPendingExtensionConnect(redirectUri: string): void {
  if (!EXTENSION_REDIRECT_RE.test(redirectUri)) return
  try {
    sessionStorage.setItem(KEY, redirectUri)
  } catch {
    // sessionStorage unavailable (private mode / quota) — the visitor lands on
    // /market and re-opens the extension link, i.e. the old behaviour.
  }
}

/** Read without clearing — used by postAuthDestination to pick the landing.
 *  Re-validates, so a hand-edited sessionStorage value cannot route anywhere. */
export function readPendingExtensionConnect(): string | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw && EXTENSION_REDIRECT_RE.test(raw) ? raw : null
  } catch {
    return null
  }
}

/** Clear once the handshake has been handled (success or invalid link), so a
 *  later unrelated login never re-routes into a stale connect attempt. */
export function clearPendingExtensionConnect(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore — the connect page re-validates and the regex guard above holds.
  }
}
