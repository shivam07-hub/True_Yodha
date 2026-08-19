"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { jobs as jobsApi } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { PrepRoom } from "@/components/preparations/prep-room"
import { PrepRoomSkeleton } from "@/components/preparations/prep-skeleton"
import "@/components/preparations/preparations.css"
import "@/app/(authed)/practice/practice.css"

/**
 * /preparations/[jobId] — one application's prep room. Deep-linkable by design
 * (grill Q4/Q8): Collections rows, the loop bar, and future notifications all
 * land here. The room renders full-screen on mobile (single-column layout).
 * practice.css is imported for the inline skill drill (the up-* quiz kit).
 */
export default function PreparationRoomPage({ params }: { params: { jobId: string } }) {
  const { jobId } = params
  const { token, ready } = useAuth()

  const appsQ = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token!),
    enabled: ready && !!token,
    staleTime: 60 * 1000,
  })

  if (!ready || appsQ.isLoading) return <PrepRoomSkeleton />

  const app = (appsQ.data ?? []).find((a) => a.job_id === decodeURIComponent(jobId))
  if (!app) {
    return (
      <div className="prp-page">
        <Link href="/preparations" className="prp-back">← Preparations</Link>
        <div className="prp-empty" style={{ marginTop: 16 }}>
          This room doesn&rsquo;t exist — the job isn&rsquo;t in your pipeline.
        </div>
      </div>
    )
  }

  return <PrepRoom token={token ?? ""} app={app} />
}
