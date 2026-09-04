/**
 * Google One Tap (FedCM) — the account chooser that appears over the page for
 * anyone already signed into Google, first-time visitors included.
 *
 * It is OFF until NEXT_PUBLIC_GOOGLE_CLIENT_ID is set: with no client ID the
 * script never loads, the CSP is never widened, and every surface renders
 * exactly as it did before. See INFRA.md for what has to be configured.
 */

export const GSI_CLIENT_SRC = "https://accounts.google.com/gsi/client"

/** Origins One Tap needs in the CSP. Added only when the client ID is set. */
export const GOOGLE_IDENTITY_ORIGIN = "https://accounts.google.com"

export interface OneTapNonce {
  /** Sent to Google; lands in the ID token's `nonce` claim. */
  hashed: string
  /** Sent to Supabase, which hashes it and compares against that claim. */
  raw: string
}

export interface GoogleCredentialResponse {
  credential?: string
  select_by?: string
}

interface GoogleIdentityApi {
  accounts: {
    id: {
      initialize(config: {
        client_id: string
        callback: (response: GoogleCredentialResponse) => void
        nonce?: string
        auto_select?: boolean
        cancel_on_tap_outside?: boolean
        context?: "signin" | "signup" | "use"
        use_fedcm_for_prompt?: boolean
      }): void
      prompt(): void
      cancel(): void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentityApi
  }
}

/**
 * Read as a whole literal — Next inlines this expression at build time, so it
 * cannot be looked up dynamically.
 */
export function googleClientId(): string | null {
  const value = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim()
  return value || null
}

export function googleOneTapEnabled(): boolean {
  return googleClientId() !== null
}

/**
 * Google is handed the SHA-256 of the nonce; Supabase is handed the original.
 * Sending the same string to both would let anyone who saw the token replay it.
 */
export async function createOneTapNonce(
  crypto: Crypto = globalThis.crypto,
): Promise<OneTapNonce> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const raw = btoa(String.fromCharCode(...bytes))
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))
  const hashed = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
  return { raw, hashed }
}
