import { NextRequest, NextResponse } from "next/server"

import {
  buildContentSecurityPolicy,
  buildNewsletterChartPolicy,
  STATIC_SECURITY_HEADERS,
} from "./lib/security-policy"

export function middleware(request: NextRequest) {
  const production = process.env.NODE_ENV === "production"
  const isNewsletterChart = request.nextUrl.pathname.startsWith(
    "/newsletter/charts/",
  )
  const nonce = btoa(crypto.randomUUID())
  const contentSecurityPolicy = isNewsletterChart
    ? buildNewsletterChartPolicy(production)
    : buildContentSecurityPolicy({
        nonce,
        apiUrl:
          process.env.NEXT_PUBLIC_API_BASE_URL ??
          process.env.NEXT_PUBLIC_API_URL,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        production,
      })

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("content-security-policy", contentSecurityPolicy)

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })
  response.headers.set("Content-Security-Policy", contentSecurityPolicy)
  for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    response.headers.set(name, value)
  }
  // These five owned chart documents are intentionally embedded by the
  // newsletter. Their hash-locked CSP allows framing only from this origin.
  if (isNewsletterChart) {
    response.headers.set("X-Frame-Options", "SAMEORIGIN")
  }
  return response
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
