import { notFound } from "next/navigation"
import type { Metadata } from "next"

import type { PublicProfile } from "@/lib/api"
import { PublicProfilePage } from "@/components/profile/PublicProfilePage"

interface Params {
  params: { ninja: string }
}

const NAME_RE = /^[a-z0-9-]{3,32}$/

function apiBase(): string {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_INTERNAL_URL ??
    ""
  )
}

async function fetchProfile(ninja: string): Promise<PublicProfile | null> {
  const base = apiBase()
  if (!base) return null
  const res = await fetch(`${base}/profile/${encodeURIComponent(ninja)}`, {
    next: { revalidate: 60 },
  })
  if (!res.ok) return null
  return (await res.json()) as PublicProfile
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const name = params.ninja.toLowerCase()
  if (!NAME_RE.test(name)) return { title: "Myro" }
  const profile = await fetchProfile(name)
  if (!profile) return { title: "Myro · Profile not found" }
  const score = profile.mirror_score != null ? Math.round(profile.mirror_score) : null
  const title = score != null ? `${name} · Myro Score ${score}` : `${name} · Myro`
  const description =
    score != null
      ? `${name}'s domain map on Myro — score ${score}/100. See where they're strong, where they're growing.`
      : `${name}'s domain map on Myro.`
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  }
}

export default async function Page({ params }: Params) {
  const name = params.ninja.toLowerCase()
  if (!NAME_RE.test(name)) notFound()

  const profile = await fetchProfile(name)
  if (!profile) notFound()

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_URL ??
    "https://himyro.com"
  const shareUrl = origin.startsWith("http")
    ? `${origin}/profile/${name}`
    : `https://${origin}/profile/${name}`

  return <PublicProfilePage initial={profile} shareUrl={shareUrl} />
}
