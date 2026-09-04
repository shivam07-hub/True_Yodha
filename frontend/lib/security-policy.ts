export const STATIC_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
} as const

export const CHART_INLINE_SCRIPT_HASHES = [
  "'sha256-2fr11gLv0vqNSQswl50BX3bKkEiuuQnn3+X2vWRINns='",
  "'sha256-FdyTW5Lur9OB5vjbpr1VUjGR0yVrklwcLKP2xGEs1yk='",
  "'sha256-sMtoTR3Ti+cJ9y5rjjpyPKbvEbStnFfkhv/XRM0ZYCc='",
  "'sha256-7dX7Fk0WPVLr5XhEqzv4Dwhl4Rsut/eWo2TNcklMKfA='",
  "'sha256-Gh8Mo5RVavEPpHN8L98CqhcuLjI/zEU1NmYP64D71N8='",
] as const

type PolicyOptions = {
  nonce: string
  apiUrl?: string
  extraApiUrls?: string[]
  supabaseUrl?: string
  production: boolean
  /** Google One Tap configured — widen for GSI only when it can actually run. */
  googleOneTap?: boolean
}

// Exactly the four sources Google Identity Services needs, path-scoped. Added
// only when a client ID is set, so the default policy stays as tight as it was.
export const GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client"
export const GSI_FRAME_SRC = "https://accounts.google.com/gsi/"
export const GSI_CONNECT_SRC = "https://accounts.google.com/gsi/"
export const GSI_STYLE_SRC = "https://accounts.google.com/gsi/style"

function origin(value: string | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function websocketOrigin(value: string | undefined): string | null {
  const parsed = origin(value)
  if (!parsed) return null
  return parsed.replace(/^https:/, "wss:").replace(/^http:/, "ws:")
}

export function buildContentSecurityPolicy({
  nonce,
  apiUrl,
  extraApiUrls = [],
  supabaseUrl,
  production,
  googleOneTap = false,
}: PolicyOptions): string {
  const connectSources = new Set([
    "'self'",
    origin(apiUrl),
    ...extraApiUrls.map(origin),
    origin(supabaseUrl),
    websocketOrigin(supabaseUrl),
    "https://challenges.cloudflare.com",
    "https://*.razorpay.com",
    ...(googleOneTap ? [GSI_CONNECT_SRC] : []),
  ])
  connectSources.delete(null)

  const directives = [
    "default-src 'self'",
    [
      "script-src",
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "https://checkout.razorpay.com",
      "https://challenges.cloudflare.com",
      ...(googleOneTap ? [GSI_SCRIPT_SRC] : []),
      ...(production ? [] : ["'unsafe-eval'"]),
    ].join(" "),
    [
      "style-src",
      "'self'",
      "'unsafe-inline'",
      ...(googleOneTap ? [GSI_STYLE_SRC] : []),
    ].join(" "),
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    `connect-src ${Array.from(connectSources).join(" ")}`,
    [
      "frame-src",
      "'self'",
      "https://challenges.cloudflare.com",
      "https://*.razorpay.com",
      ...(googleOneTap ? [GSI_FRAME_SRC] : []),
    ].join(" "),
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ]

  return directives.join("; ")
}

export function buildNewsletterChartPolicy(production: boolean): string {
  return [
    "default-src 'none'",
    [
      "script-src",
      "'self'",
      "https://cdnjs.cloudflare.com",
      ...CHART_INLINE_SCRIPT_HASHES,
    ].join(" "),
    "style-src 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ].join("; ")
}
