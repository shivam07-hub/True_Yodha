import { NextResponse } from "next/server"

/**
 * Dev-only: mint a session as the QA account. Credentials stay on the server.
 * Production 404s this whole /dev tree (middleware + NODE_ENV).
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 })
  }

  const email = process.env.MYRO_TEST_EMAIL?.trim()
  const password = process.env.MYRO_TEST_PASSWORD
  const api = (process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(
    /\/$/,
    "",
  )
  if (!email || !password || !api) {
    return NextResponse.json({ ok: false, reason: "unset" }, { status: 503 })
  }

  const res = await fetch(`${api}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    return NextResponse.json({ ok: false, reason: "rejected" }, { status: res.status })
  }

  const data = (await res.json()) as {
    access_token?: string | null
    refresh_token?: string | null
  }
  if (!data.access_token) {
    return NextResponse.json({ ok: false, reason: "rejected" }, { status: 502 })
  }

  return NextResponse.json({
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? null,
  })
}
