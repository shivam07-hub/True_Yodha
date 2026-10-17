/**
 * Where the newsletter subscribe box sends a new reader.
 *
 * NEXT_PUBLIC_SUBSTACK_PUBLICATION_URL is the publication origin that
 * receives the issue. himyro.substack.com is a different publication
 * titled "mimi", so it is not a destination. An empty value keeps the
 * on-site email capture.
 */

const MIMI_HOST = "himyro.substack.com"

export function substackSubscribeHref(
  raw: string | undefined | null,
): string | null {
  const value = (raw ?? "").trim()
  if (!value) return null
  const url = new URL(value)
  if (url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SUBSTACK_PUBLICATION_URL must use https")
  }
  if (url.username || url.password) {
    throw new Error("NEXT_PUBLIC_SUBSTACK_PUBLICATION_URL must not embed credentials")
  }
  const host = url.hostname.toLowerCase()
  if (host === MIMI_HOST) return null
  const path = url.pathname.replace(/\/$/, "")
  if (path !== "" && path !== "/subscribe") {
    throw new Error(
      "NEXT_PUBLIC_SUBSTACK_PUBLICATION_URL must be the publication origin",
    )
  }
  return `https://${host}/subscribe`
}
