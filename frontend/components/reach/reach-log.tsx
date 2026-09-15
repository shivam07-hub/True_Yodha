"use client"

/**
 * Path 3 log — nominate a person the user found, then mark sent / replied.
 * Lives inside the job Reach section. The desk at /reach is the same ledger.
 */

import * as React from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs as jobsApi, type ReachTarget } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { nextReachAction, REACH_STATUS_LABEL, reachCopy } from "@/lib/reach/labels"
import { Button } from "@/components/ui/button"

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)
  if (!text) return null
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        void navigator.clipboard?.writeText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? "Copied" : "Copy note"}
    </Button>
  )
}

function PersonRow({
  token,
  person,
}: {
  token: string
  person: ReachTarget
}) {
  const qc = useQueryClient()
  const advance = useMutation({
    mutationFn: (action: "sent" | "followed_up" | "replied" | "stopped") =>
      jobsApi.advanceReachTarget(token, person.id, action),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dataKeys.reachTargets(person.job_id ?? "all") })
      void qc.invalidateQueries({ queryKey: dataKeys.reachTargets("all") })
      void qc.invalidateQueries({ queryKey: dataKeys.reachTargets("due") })
    },
  })
  const next = nextReachAction(person.status, person.due)
  const note = reachCopy(person)
  return (
    <div className="db-reach-person">
      <div className="db-reach-person-head">
        <a href={person.profile_url} target="_blank" rel="noopener noreferrer" className="db-reach-person-name">
          {person.display_name}
        </a>
        <span className={`db-reach-st${person.due ? " is-due" : ""}`}>
          {person.due ? "Follow-up due" : REACH_STATUS_LABEL[person.status]}
        </span>
      </div>
      {note ? <p className="db-reach-copy-body">{note}</p> : null}
      <div className="db-reach-person-actions">
        <CopyBtn text={note} />
        {next ? (
          <Button type="button" variant="ghost" size="sm" loading={advance.isPending} onClick={() => advance.mutate(next.action)}>
            {next.label}
          </Button>
        ) : null}
        {person.status !== "replied" && person.status !== "stopped" ? (
          <Button type="button" variant="ghost" size="sm" loading={advance.isPending} onClick={() => advance.mutate("replied")}>
            They replied
          </Button>
        ) : null}
      </div>
      {advance.isError ? <p className="db-reach-err">Couldn’t update that. Try again.</p> : null}
    </div>
  )
}

export function ReachLog({
  token,
  jobId,
  company,
}: {
  token: string
  jobId: string
  company: string | null
}) {
  const qc = useQueryClient()
  const [name, setName] = React.useState("")
  const [url, setUrl] = React.useState("")
  const list = useQuery({
    queryKey: dataKeys.reachTargets(jobId),
    queryFn: () => jobsApi.listReachTargets(token, { jobId }),
    enabled: !!token && !!jobId,
    staleTime: 30 * 1000,
  })
  const add = useMutation({
    mutationFn: () =>
      jobsApi.createReachTarget(token, {
        profile_url: url,
        display_name: name,
        company,
        job_id: jobId,
      }),
    onSuccess: () => {
      setName("")
      setUrl("")
      void qc.invalidateQueries({ queryKey: dataKeys.reachTargets(jobId) })
      void qc.invalidateQueries({ queryKey: dataKeys.reachTargets("all") })
      void qc.invalidateQueries({ queryKey: dataKeys.reachTargets("due") })
    },
  })
  const people = list.data?.targets ?? []
  const err = add.error instanceof Error ? add.error.message : add.isError ? "Couldn’t log that profile." : null
  return (
    <div className="db-reach-log">
      <div className="db-reach-log-head">
        <span className="db-label">People you reached</span>
        <Link href={`/reach?jobId=${encodeURIComponent(jobId)}`} className="db-reach-desk-link">
          Desk
        </Link>
      </div>
      <form
        className="db-reach-form"
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate()
        }}
      >
        <input
          className="tm-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name on the profile"
          maxLength={80}
          required
          aria-label="Name on the profile"
        />
        <input
          className="tm-input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="linkedin.com/in/…"
          maxLength={400}
          required
          aria-label="LinkedIn profile URL"
        />
        <Button type="submit" variant="outline" size="sm" loading={add.isPending}>
          {add.isPending ? "Logging" : "Log"}
        </Button>
      </form>
      {err ? <p className="db-reach-err">{err}</p> : null}
      {people.map((p) => (
        <PersonRow key={p.id} token={token} person={p} />
      ))}
    </div>
  )
}
