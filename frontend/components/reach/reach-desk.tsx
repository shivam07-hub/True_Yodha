"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs as jobsApi, type ReachTarget } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { nextReachAction, REACH_STATUS_LABEL, reachCopy } from "@/lib/reach/labels"
import { Button } from "@/components/ui/button"
import "./reach.css"

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
      {copied ? "Copied" : "Copy"}
    </Button>
  )
}

function Row({ token, person }: { token: string; person: ReachTarget }) {
  const qc = useQueryClient()
  const advance = useMutation({
    mutationFn: (action: "sent" | "followed_up" | "replied" | "stopped") =>
      jobsApi.advanceReachTarget(token, person.id, action),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dataKeys.reachTargets("all") })
      void qc.invalidateQueries({ queryKey: dataKeys.reachTargets("due") })
      if (person.job_id) void qc.invalidateQueries({ queryKey: dataKeys.reachTargets(person.job_id) })
    },
  })
  const next = nextReachAction(person.status, person.due)
  const note = reachCopy(person)
  return (
    <article className="rd-row">
      <div className="rd-row-main">
        <a href={person.profile_url} target="_blank" rel="noopener noreferrer" className="rd-name">
          {person.display_name}
        </a>
        <span className="rd-meta">
          {[person.role_title, person.company].filter(Boolean).join(" · ")}
        </span>
        <span className={person.due ? "rd-st is-due" : "rd-st"}>
          {person.due ? "Follow-up due" : REACH_STATUS_LABEL[person.status]}
        </span>
      </div>
      {note ? <p className="rd-note">{note}</p> : null}
      <div className="rd-actions">
        <CopyBtn text={note} />
        {next ? (
          <Button type="button" variant="ghost" size="sm" loading={advance.isPending} onClick={() => advance.mutate(next.action)}>
            {next.label}
          </Button>
        ) : null}
        {person.status !== "replied" && person.status !== "stopped" ? (
          <>
            <Button type="button" variant="ghost" size="sm" loading={advance.isPending} onClick={() => advance.mutate("replied")}>
              They replied
            </Button>
            <Button type="button" variant="ghost" size="sm" loading={advance.isPending} onClick={() => advance.mutate("stopped")}>
              Stop
            </Button>
          </>
        ) : null}
      </div>
    </article>
  )
}

export function ReachDesk({ token }: { token: string }) {
  const params = useSearchParams()
  const jobId = params.get("jobId")
  const qc = useQueryClient()
  const [name, setName] = React.useState("")
  const [url, setUrl] = React.useState("")
  const [company, setCompany] = React.useState("")
  const list = useQuery({
    queryKey: dataKeys.reachTargets("all"),
    queryFn: () => jobsApi.listReachTargets(token),
    enabled: !!token,
    staleTime: 20 * 1000,
  })
  const add = useMutation({
    mutationFn: () =>
      jobsApi.createReachTarget(token, {
        profile_url: url,
        display_name: name,
        company: company || null,
        job_id: jobId,
      }),
    onSuccess: () => {
      setName("")
      setUrl("")
      setCompany("")
      void qc.invalidateQueries({ queryKey: dataKeys.reachTargets("all") })
      void qc.invalidateQueries({ queryKey: dataKeys.reachTargets("due") })
      if (jobId) void qc.invalidateQueries({ queryKey: dataKeys.reachTargets(jobId) })
    },
  })
  const all = list.data?.targets ?? []
  const scoped = jobId ? all.filter((t) => t.job_id === jobId) : all
  const due = scoped.filter((t) => t.due)
  const open = scoped.filter((t) => !t.due && (t.status === "queued" || t.status === "sent" || t.status === "followed_up"))
  const closed = scoped.filter((t) => t.status === "replied" || t.status === "stopped")
  return (
    <div className="rd tm-page-enter">
      <header className="rd-head">
        <h1>Desk</h1>
        <p>
          You find the person. You send. Myro keeps the queue. No auto-send.
        </p>
        <Link href="/collections" className="rd-back">Collections</Link>
      </header>
      <form
        className="rd-form"
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate()
        }}
      >
        <input className="tm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" maxLength={80} required aria-label="Name" />
        <input className="tm-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="linkedin.com/in/…" maxLength={400} required aria-label="LinkedIn profile URL" />
        <input className="tm-input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" maxLength={200} aria-label="Company" />
        <Button type="submit" size="sm" loading={add.isPending}>
          {add.isPending ? "Logging" : "Log person"}
        </Button>
      </form>
      {add.isError ? <p className="rd-err">Couldn’t log that. Use a linkedin.com/in/ URL.</p> : null}
      {list.isLoading ? <p className="rd-empty">Loading the queue…</p> : null}
      {due.length > 0 ? (
        <section className="rd-sec">
          <h2>Due today</h2>
          {due.map((p) => <Row key={p.id} token={token} person={p} />)}
        </section>
      ) : null}
      <section className="rd-sec">
        <h2>Open</h2>
        {open.length === 0 && !list.isLoading ? <p className="rd-empty">Log someone you just found.</p> : null}
        {open.map((p) => <Row key={p.id} token={token} person={p} />)}
      </section>
      {closed.length > 0 ? (
        <section className="rd-sec">
          <h2>Closed</h2>
          {closed.map((p) => <Row key={p.id} token={token} person={p} />)}
        </section>
      ) : null}
    </div>
  )
}
