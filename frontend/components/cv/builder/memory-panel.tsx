/**
 * MemoryPanel — the Memory view on /cv: the persona canvas leads ("What Myro
 * knows about you", Lane B — one living document in three movements), with the
 * evidence substrate demoted below it: store counts (stories / connections /
 * facts) and the fact list behind a review disclosure. Trust comes from the
 * user seeing and controlling everything the canvas is written from.
 */
"use client"

import { useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { MemoryFact, MemoryKind } from "@/lib/api"
import { cv as cvApi, jobs as jobsApi, memory as memoryApi } from "@/lib/api"
import { formatCount } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { CareerProfileCard } from "./career-profile-card"
import { PersonaCanvas } from "./persona-canvas"
import { MyroChat } from "@/components/myro/myro-chat"
import "./memory-panel.css"

const KIND_LABELS: Record<MemoryKind, string> = {
  aspiration: "Aspiration",
  constraint: "Constraint",
  habit: "Habit",
  preference: "Preference",
  salary: "Salary",
  work_mode: "Work mode",
  target_company: "Target company",
  note: "Note",
}

function FactRow({ token, fact }: { token: string; fact: MemoryFact }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(fact.text)
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["userMemory"] })

  const save = useMutation({
    mutationFn: () => memoryApi.update(token, fact.id, { text: draft.trim() }),
    onSuccess: () => { setEditing(false); invalidate() },
  })
  const forget = useMutation({
    mutationFn: () => memoryApi.remove(token, fact.id),
    onSuccess: invalidate,
  })

  return (
    <li className="tm-mem-fact">
      <div className="tm-mem-fact-meta">
        <span className="tm-mem-kind">{KIND_LABELS[fact.kind] ?? fact.kind}</span>
        {fact.source === "distilled" && <span className="tm-mem-source">learned</span>}
      </div>
      {editing ? (
        <div className="tm-mem-edit">
          <textarea
            className="tm-mem-edit-input"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="tm-mem-fact-actions">
            <Button size="sm" disabled={!draft.trim() || save.isPending} onClick={() => save.mutate()}>Save</Button>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setDraft(fact.text) }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="tm-mem-fact-text">{fact.text}</p>
          <div className="tm-mem-fact-actions">
            <button type="button" className="tm-mem-link" onClick={() => setEditing(true)}>Edit</button>
            <button type="button" className="tm-mem-link" disabled={forget.isPending} onClick={() => forget.mutate()}>Forget</button>
          </div>
        </>
      )}
    </li>
  )
}

export function MemoryPanel({ token }: { token: string }) {
  const qc = useQueryClient()
  const [kind, setKind] = useState<MemoryKind>("note")
  const [text, setText] = useState("")

  const facts = useQuery({
    queryKey: ["userMemory"],
    queryFn: () => memoryApi.list(token),
  })
  const profile = useQuery({
    queryKey: ["careerReservoirProfile"],
    queryFn: () => cvApi.career.profile(token),
  })
  const connections = useQuery({
    queryKey: ["connectionsStatus"],
    queryFn: () => jobsApi.connectionsStatus(token),
  })

  const add = useMutation({
    mutationFn: () => memoryApi.add(token, kind, text.trim()),
    onSuccess: () => {
      setText("")
      void qc.invalidateQueries({ queryKey: ["userMemory"] })
    },
  })
  const forgetConnections = useMutation({
    mutationFn: () => jobsApi.clearConnections(token),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["connectionsStatus"] }),
  })

  const activeFacts = (facts.data?.facts ?? []).filter((f) => f.status === "active")
  const storyCount = profile.data?.story_count ?? 0
  const connectionCount = connections.data?.count ?? 0

  return (
    <section className="tm-mem-scope" aria-label="What Myro knows about you">
      <PersonaCanvas token={token} />

      {/* The CV surface's Myro. It talks and it listens — no proposal, because
          the CV screen has no typed accept path and a change with no button is
          worse than no change. What you say here becomes memory on the turn
          (backend mentor_learn), which is what makes the canvas above grow from
          a conversation instead of a form. */}
      <div className="mt-5">
        <MyroChat
          token={token}
          surface="cv"
          heading="Tell Myro about your work"
          seed="Tell me about something you've done that this CV doesn't capture — or what you actually want next. I'll remember it."
          placeholder="Say it however you'd say it out loud"
        />
      </div>

      <CareerProfileCard token={token} title="What recruiters ask" />

      <p className="tm-mem-substrate-note">
        Everything above is written from stores you can see, edit and forget.
        Nothing here is invented.
      </p>

      <div className="tm-mem-stores">
        <Link href="/cv?view=stories" className="tm-mem-store">
          {profile.isLoading
            ? <span className="tm-skeleton tm-mem-store-skel" aria-hidden />
            : <span className="tm-mem-store-count">{storyCount}</span>}
          <span className="tm-mem-store-label">career stories</span>
        </Link>
        <div className="tm-mem-store">
          {connections.isLoading
            ? <span className="tm-skeleton tm-mem-store-skel" aria-hidden />
            : <span className="tm-mem-store-count">{formatCount(connectionCount)}</span>}
          <span className="tm-mem-store-label">connections</span>
          {connectionCount > 0 && (
            <button
              type="button"
              className="tm-mem-link"
              disabled={forgetConnections.isPending}
              onClick={() => forgetConnections.mutate()}
            >
              Forget all
            </button>
          )}
        </div>
        <div className="tm-mem-store">
          {facts.isLoading
            ? <span className="tm-skeleton tm-mem-store-skel" aria-hidden />
            : <span className="tm-mem-store-count">{activeFacts.length}</span>}
          <span className="tm-mem-store-label">facts</span>
        </div>
      </div>

      <details className="tm-mem-review">
        <summary>
          {activeFacts.length > 0
            ? `Review the ${activeFacts.length} learned facts behind this`
            : "Tell Myro something to remember"}
        </summary>

        <form
          className="tm-mem-composer"
          onSubmit={(e) => { e.preventDefault(); if (text.trim()) add.mutate() }}
        >
          <select
            className="tm-mem-kind-select"
            value={kind}
            aria-label="Fact type"
            onChange={(e) => setKind(e.target.value as MemoryKind)}
          >
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <input
            className="tm-mem-composer-input"
            placeholder="Tell Myro something to remember…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={!text.trim() || add.isPending}>
            Remember
          </Button>
        </form>

        {facts.isPending && <p className="tm-mem-empty">Loading…</p>}
        {facts.isError && <p className="tm-mem-empty" role="alert">Couldn’t load memory — try again.</p>}
        {facts.isSuccess && activeFacts.length === 0 && (
          <p className="tm-mem-empty">
            Nothing remembered yet. Add a fact above, or drop your files into
            Stories — Myro learns as you go.
          </p>
        )}
        {activeFacts.length > 0 && (
          <ul className="tm-mem-facts">
            {activeFacts.map((fact) => (
              <FactRow key={fact.id} token={token} fact={fact} />
            ))}
          </ul>
        )}
      </details>
    </section>
  )
}
