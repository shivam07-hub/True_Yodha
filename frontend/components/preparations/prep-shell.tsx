"use client"

/**
 * PrepShell — the one Preparations screen (Unified Prep v2, artboard 2b).
 *
 * `/preparations` and `/preparations/[jobId]` are the SAME screen: the rail
 * lists every room, the main column is the open one. The list route opens the
 * room that most wants attention rather than showing a menu — a stage-grouped
 * index of rooms was a second place to read the same state the pips now carry.
 *
 * One ladder read serves both columns, so the rail and the room can never
 * disagree about which step a job is on.
 */

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { jobs as jobsApi, preparations, type ApplicationResponse } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { PrepSkeleton } from "./prep-skeleton"
import { PrepRail } from "./prep-rail"
import { PrepRoom } from "./prep-room"
import { ladderOrder, liveRoomCount, roomStage } from "./prep-model"
import "@/app/(authed)/home/mission-control.css"

/** The room the list route opens: the first still-workable one, hottest first. */
function openByDefault(ordered: ApplicationResponse[]): string | null {
  const live = ordered.find((app) => roomStage(app.status) !== "closed")
  return (live ?? ordered[0])?.job_id ?? null
}

export function PrepShell({
  token,
  jobId = null,
}: {
  token: string
  jobId?: string | null
}) {
  const appsQ = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token),
    enabled: !!token,
    staleTime: 60 * 1000,
  })
  // Independent of the applications read: the rail paints its rooms as soon as
  // the tracker answers, and the pips fill in when the ladder does. A room list
  // that waits for both would be blank for the slower of the two.
  const ladderQ = useQuery({
    queryKey: dataKeys.prepLadder(),
    queryFn: () => preparations.ladder(token),
    enabled: !!token,
    staleTime: 60 * 1000,
  })

  if (appsQ.isLoading) return <PrepSkeleton />

  const apps = appsQ.data ?? []
  const ordered = ladderOrder(apps)
  const selectedId = jobId ?? openByDefault(ordered)
  const app = ordered.find((a) => a.job_id === selectedId) ?? null
  const room = ladderQ.data?.rooms.find((r) => r.job_id === selectedId)

  return (
    <div className="tm-intel-page prp-workspace-page">
      <div className="mc-workspace">
        <PrepRail
          token={token}
          apps={ordered}
          ladder={ladderQ.data}
          selectedJobId={selectedId}
          live={liveRoomCount(apps)}
        />
        <div className="mc-ws-main">
          {app ? (
            <PrepRoom token={token} app={app} room={room} totals={ladderQ.data?.totals} />
          ) : jobId ? (
            <div className="prp-empty">
              This room doesn&rsquo;t exist — the job isn&rsquo;t in your pipeline.{" "}
              <Link href="/preparations">Back to Preparations</Link>
            </div>
          ) : (
            <div className="prp-empty">
              Nothing to prep yet.{" "}
              <Link href="/collections">Apply to a job in Collections</Link> and its
              room opens here.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
