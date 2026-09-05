import { auth } from "@/lib/api"
import { rememberAuth } from "@/lib/auth/last-auth"
import { hashEmailDomain, signupEvents } from "@/lib/analytics"

export const MAGIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface SendInput {
  email: string
  redirectTo?: string | null
  surface: string
}

/**
 * The one place a magic link is requested. Two surfaces send it — the typed
 * input and the returning-user card, which sends to an address the visitor
 * never retypes — and both owe the same three side effects: normalize the
 * address, remember the device, report the send. A second copy of this is how
 * one of them ends up not remembering the person it just emailed.
 *
 * Returns the normalized address. Throws the transport error after reporting
 * it, so the caller renders the message.
 */
export async function sendMagicLink({ email, redirectTo, surface }: SendInput): Promise<string> {
  const value = email.trim().toLowerCase()
  if (!MAGIC_EMAIL_RE.test(value)) {
    throw new Error("That doesn't look like a complete email.")
  }
  signupEvents.methodTapped({ method: "magic_link", surface })
  try {
    await auth.magicLinkRequest(value, redirectTo)
  } catch (err) {
    signupEvents.failed({ method: "magic_link", stage: "send", error_code: "send_failed" })
    throw err
  }
  rememberAuth("magic_link", value)
  signupEvents.magicLinkSent({ email_domain_hash: hashEmailDomain(value) })
  return value
}
