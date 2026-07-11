/**
 * Career Story Reservoir — the "Stories" mode of the CV workspace.
 *
 * The comprehensive profile Myro builds from the user's dump (old CVs, LinkedIn
 * export, pasted notes): roles → STAR stories → canonical pointers. The
 * signature element is the story card: on the surface it reads as one strong
 * CV line (◆ pointer + metric chips); expanded, it shows the story underneath
 * (situation / task / action / result) — the product thesis made visible.
 *
 * Extraction auto-accepts (curate-after, 2026-07-11): archive is the curation
 * verb, never delete. While dumped files are still being read the head shows a
 * live pulse line and the profile polls until the reservoir settles.
 */
"use client"

import { useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ApplicationResponse, CareerProfile, CareerStory } from "@/lib/api"
import { APPLICATION_OUTCOMES, cv as cvApi } from "@/lib/api"
import { ReservoirDump } from "./reservoir-dump"
import "./reservoir-profile.css"

const STAR_FIELDS = [
  ["situation", "S"],
  ["task", "T"],
  ["action", "A"],
  ["result", "R"],
] as const

function StoryCard({ story, token, onArchived }: {
  story: CareerStory
  token: string
  onArchived: () => void
}) {
  const [open, setOpen] = useState(false)
  const archive = useMutation({
    mutationFn: () => cvApi.career.patchStory(token, story.id, { status: "archived" }),
    onSuccess: onArchived,
  })

  const narrative = STAR_FIELDS.filter(([key]) => (story.narrative[key] || "").trim())
  return (
    <article className={`tm-rsv-story${open ? " open" : ""}`}>
      <button
        type="button"
        className="tm-rsv-story-line"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="tm-rsv-diamond" aria-hidden>◆</span>
        <span className="tm-rsv-pointer">{story.pointer || story.title}</span>
        <span className="tm-rsv-chips">
          {story.metrics.slice(0, 3).map((m) => (
            <span key={m.value + m.what} className="tm-rsv-chip" title={m.what}>{m.value}</span>
          ))}
        </span>
      </button>
      {open && (
        <div className="tm-rsv-under">
          {narrative.length > 0 && (
            <dl className="tm-rsv-star">
              {narrative.map(([key, letter]) => (
                <div key={key} className="tm-rsv-star-row">
                  <dt aria-label={key}>{letter}</dt>
                  <dd>{story.narrative[key]}</dd>
                </div>
              ))}
            </dl>
          )}
          {story.skills.length > 0 && (
            <div className="tm-rsv-skills">
              {story.skills.map((s) => <span key={s} className="tm-rsv-skill">{s}</span>)}
            </div>
          )}
          <div className="tm-rsv-story-actions">
            <button
              type="button"
              className="tm-rsv-quiet-btn"
              disabled={archive.isPending}
              onClick={() => archive.mutate()}
            >
              Archive
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

function TailorMenu({ applications, token, onOpenJob }: {
  applications: ApplicationResponse[]
  token: string
  onOpenJob: (jobId: string) => void
}) {
  const [open, setOpen] = useState(false)
  // Success feedback IS the navigation: the playground opens on the projected
  // version. Only failure needs words.
  const project = useMutation({
    mutationFn: (jobId: string) => cvApi.career.project(token, jobId),
    onSuccess: (_result, jobId) => {
      setOpen(false)
      onOpenJob(jobId)
    },
  })

  const targets = applications.filter((a) => !APPLICATION_OUTCOMES.includes(a.status)).slice(0, 12)
  if (targets.length === 0) return null

  return (
    <div className="tm-rsv-tailor">
      <button type="button" className="cvb-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Tailor for job
      </button>
      {open && (
        <div className="tm-rsv-tailor-menu" role="menu">
          {targets.map((a) => (
            <button
              key={a.job_id}
              type="button"
              role="menuitem"
              disabled={project.isPending}
              onClick={() => project.mutate(a.job_id)}
            >
              <span className="tm-rsv-tailor-title">{a.title}</span>
              {a.company && <span className="tm-rsv-tailor-co">{a.company}</span>}
            </button>
          ))}
          {project.isError && (
            <p className="tm-rsv-tailor-error" role="alert">
              {project.error instanceof Error ? project.error.message : "Couldn't tailor — try again."}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function ReservoirProfile({ token, applications, onOpenJob }: {
  token: string
  applications: ApplicationResponse[]
  onOpenJob: (jobId: string) => void
}) {
  const queryClient = useQueryClient()
  const [dumpOpen, setDumpOpen] = useState(false)
  // Poll while the extractor is still reading dumped files, then settle.
  const pendingRef = useRef(0)
  const profileQuery = useQuery({
    queryKey: ["cv", "careerProfile"],
    queryFn: () => cvApi.career.profile(token),
    refetchInterval: () => (pendingRef.current > 0 ? 4000 : false),
  })
  pendingRef.current = profileQuery.data?.pending_inflows ?? 0

  const profile: CareerProfile | undefined = profileQuery.data
  const refetch = () => queryClient.invalidateQueries({ queryKey: ["cv", "careerProfile"] })

  const isEmpty = !!profile && profile.story_count === 0 && profile.pending_inflows === 0
  const competencies = useMemo(() => (profile?.competencies ?? []).slice(0, 10), [profile])

  if (profileQuery.isLoading) {
    return <div className="tm-rsv-scope"><div className="tm-rsv-loading" aria-label="Loading stories" /></div>
  }

  return (
    <div className="tm-rsv-scope">
      <header className="tm-rsv-head">
        <div className="tm-rsv-head-main">
          <h2 className="tm-rsv-title">
            Career stories
            {profile && profile.story_count > 0 && <span className="tm-rsv-count">{profile.story_count}</span>}
          </h2>
          {competencies.length > 0 && (
            <p className="tm-rsv-competencies">{competencies.join(" · ")}</p>
          )}
        </div>
        <div className="tm-rsv-head-actions">
          {profile && profile.story_count > 0 && (
            <TailorMenu applications={applications} token={token} onOpenJob={onOpenJob} />
          )}
          {!isEmpty && (
            <button type="button" className="cvb-btn primary" onClick={() => setDumpOpen((v) => !v)}>
              Add your past
            </button>
          )}
        </div>
      </header>

      {profile && profile.pending_inflows > 0 && (
        <p className="tm-rsv-pending" role="status">
          <span className="tm-rsv-pulse" aria-hidden />
          Reading {profile.pending_inflows} {profile.pending_inflows === 1 ? "dump" : "dumps"}
        </p>
      )}

      {(dumpOpen || isEmpty) && (
        <ReservoirDump
          token={token}
          hero={isEmpty}
          onIngested={() => { setDumpOpen(false); void refetch() }}
        />
      )}

      {profile?.roles.map((role) => (
        <section key={role.id} className="tm-rsv-role">
          <header className="tm-rsv-role-head">
            <div className="tm-rsv-role-names">
              <span className="tm-rsv-role-company">{role.company || role.title}</span>
              {role.company && <span className="tm-rsv-role-title">{role.title}</span>}
            </div>
            <div className="tm-rsv-role-meta">
              {role.date_label && <span>{role.date_label}</span>}
              {role.kind !== "work" && <span className="tm-rsv-role-kind">{role.kind}</span>}
            </div>
          </header>
          {role.stories.map((story) => (
            <StoryCard key={story.id} story={story} token={token} onArchived={() => void refetch()} />
          ))}
        </section>
      ))}

      {profile && profile.highlights.length > 0 && (
        <section className="tm-rsv-role">
          <header className="tm-rsv-role-head">
            <div className="tm-rsv-role-names">
              <span className="tm-rsv-role-company">Highlights</span>
            </div>
          </header>
          {profile.highlights.map((story) => (
            <StoryCard key={story.id} story={story} token={token} onArchived={() => void refetch()} />
          ))}
        </section>
      )}
    </div>
  )
}
