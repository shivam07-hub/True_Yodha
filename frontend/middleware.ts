import { NextRequest, NextResponse } from "next/server"

import { publicApiConnectOrigins, publicApiHost } from "./lib/public-api"
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
        apiUrl: publicApiHost(),
        extraApiUrls: publicApiConnectOrigins(),
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        production,
        googleOneTap: Boolean((process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim()),
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
