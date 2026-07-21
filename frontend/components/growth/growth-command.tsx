"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  growth,
  type GrowthMessageUpdate,
  type GrowthMetricUpdate,
  type GrowthPublicationCreate,
} from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { getAccessToken } from "@/lib/session"
import { GrowthCharts } from "./growth-charts"
import { GrowthFilters, type GrowthFilterState } from "./growth-filters"
import { GrowthIssues } from "./growth-issues"
import {
  downloadGrowthSnapshot,
  parseGrowthSnapshot,
} from "./growth-snapshot"
import { GrowthSweeps } from "./growth-sweeps"
import { GrowthTable } from "./growth-table"

type GrowthTab = "pipeline" | "issues" | "sweeps"

const INITIAL_FILTERS: GrowthFilterState = {
  channel: "all",
  status: "all",
  format: "all",
}

function displayStatus(status: string): "draft" | "posted" | "paused" {
  if (status === "published" || status === "posted") return "posted"
  if (status === "paused") return "paused"
  return "draft"
}

export function GrowthCommand() {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const [tab, setTab] = useState<GrowthTab>("pipeline")
  const [filters, setFilters] = useState(INITIAL_FILTERS)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [importFeedback, setImportFeedback] = useState("")

  useEffect(() => setToken(getAccessToken()), [])

  const commandQuery = useQuery({
    queryKey: dataKeys.growthCommand(),
    queryFn: () => growth.bootstrap(token!),
    enabled: Boolean(token),
  })
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: dataKeys.growthCommand() })
  const saveMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: GrowthMessageUpdate }) =>
      growth.updateMessage(token!, id, body),
    onSuccess: refresh,
  })
  const publishMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: GrowthPublicationCreate }) =>
      growth.publishMessage(token!, id, body),
    onSuccess: refresh,
  })
  const metricsMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string
      body: GrowthMetricUpdate
    }) => growth.updatePublicationMetrics(token!, id, body),
    onSuccess: refresh,
  })
  const importMutation = useMutation({
    mutationFn: (body: Parameters<typeof growth.importLegacy>[1]) =>
      growth.importLegacy(token!, body),
    onSuccess: refresh,
  })

  const data = commandQuery.data
  const assets = useMemo(
    () => Object.fromEntries((data?.assets ?? []).map((asset) => [asset.id, asset])),
    [data?.assets],
  )
  const campaigns = useMemo(
    () =>
      Object.fromEntries(
        (data?.campaigns ?? []).map((campaign) => [campaign.id, campaign]),
      ),
    [data?.campaigns],
  )
  const publications = useMemo(
    () =>
      Object.fromEntries(
        (data?.publications ?? []).map((publication) => [
          publication.message_id,
          publication,
        ]),
      ),
    [data?.publications],
  )
  const messages = useMemo(() => data?.messages ?? [], [data?.messages])
  const filtered = messages.filter(
    (message) =>
      (filters.channel === "all" || message.channel === filters.channel) &&
      (filters.status === "all" ||
        displayStatus(message.status) === filters.status) &&
      (filters.format === "all" || message.format === filters.format),
  )

  async function importSnapshot(file: File): Promise<void> {
    setImportFeedback("")
    try {
      const payload = parseGrowthSnapshot(await file.text(), data)
      const result = await importMutation.mutateAsync(payload)
      setImportFeedback(
        `Loaded ${result.messages} messages and ${result.sweeps} sweeps.`,
      )
    } catch (error) {
      setImportFeedback(
        error instanceof Error ? error.message : "Snapshot import failed.",
      )
    }
  }

  if (token === undefined) return <CommandLoading />
  if (!token) {
    return (
      <CommandGate
        title="Sign in to Distribution Tracker"
        detail="This surface is available only to approved Myro operators."
      />
    )
  }
  if (commandQuery.isLoading) return <CommandLoading />
  if (commandQuery.isError || !data) {
    return <AccessRequestGate token={token} />
  }

  const draftCount = filtered.filter(
    (message) => displayStatus(message.status) === "draft",
  ).length
  const postedCount = filtered.filter(
    (message) => displayStatus(message.status) === "posted",
  ).length
  const pausedCount = filtered.filter(
    (message) => displayStatus(message.status) === "paused",
  ).length
  const clicks = filtered.reduce((total, message) => {
    const value = publications[message.id]?.outcome.clicks
    return total + (typeof value === "number" ? value : 0)
  }, 0)

  return (
    <main className="gc-shell">
      <header className="gc-header">
        <div>
          <h1>Myro Distribution Tracker</h1>
          <p>
            Live · edit drafts, log what went out, and preserve your writing
            decisions across devices
          </p>
        </div>
        <div className="gc-header-meta">
          <span>{messages.length} items</span>
          <small>{data.operator.display_name || "Operator"} · {data.operator.role}</small>
        </div>
      </header>

      <nav className="gc-tabs" aria-label="Distribution Tracker workspaces">
        <Tab active={tab === "pipeline"} onClick={() => setTab("pipeline")}>
          Postings pipeline
        </Tab>
        <Tab active={tab === "issues"} onClick={() => setTab("issues")}>
          Newsletter issues
        </Tab>
        <Tab active={tab === "sweeps"} onClick={() => setTab("sweeps")}>
          Seeding sweeps
        </Tab>
      </nav>

      {tab === "pipeline" ? (
        <section className="gc-wrap">
          <div className="gc-hint">
            Open a row, copy the prepared insight, tweak it in context, publish
            manually, then paste the exact final version back here. That
            draft-to-final pair becomes the durable record of your voice.
          </div>
          <GrowthFilters
            value={filters}
            messages={messages}
            onChange={setFilters}
            onExport={() => downloadGrowthSnapshot(data)}
            onImport={(file) => void importSnapshot(file)}
            importing={importMutation.isPending}
          />
          <p className="gc-import-feedback" aria-live="polite">
            {importFeedback}
          </p>
          <div className="gc-kpis">
            <Kpi label="Total" value={filtered.length} detail="posts + responses" />
            <Kpi label="Draft" value={draftCount} detail="not yet out" tone="gray" />
            <Kpi label="Posted" value={postedCount} detail="live" tone="green" />
            <Kpi label="Paused" value={pausedCount} detail="held" tone="red" />
            <Kpi label="Clicks logged" value={clicks} detail="sum of CTA clicks" tone="purple" />
          </div>
          <GrowthCharts messages={filtered} />
          <GrowthTable
            messages={filtered}
            assets={assets}
            campaigns={campaigns}
            publications={publications}
            expandedId={expandedId}
            onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
            onSave={(id, body) => saveMutation.mutateAsync({ id, body }).then(() => undefined)}
            onPublish={(id, body) =>
              publishMutation.mutateAsync({ id, body }).then(() => undefined)}
            onMetrics={(id, body) =>
              metricsMutation.mutateAsync({ id, body }).then(() => undefined)}
          />
        </section>
      ) : null}
      {tab === "issues" ? (
        <div className="gc-wrap"><GrowthIssues assets={data.assets} /></div>
      ) : null}
      {tab === "sweeps" ? (
        <div className="gc-wrap"><GrowthSweeps sweeps={data.sweeps} /></div>
      ) : null}
    </main>
  )
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button type="button" data-active={active} onClick={onClick}>
      {children}
    </button>
  )
}

function Kpi({
  label,
  value,
  detail,
  tone = "blue",
}: {
  label: string
  value: number
  detail: string
  tone?: string
}) {
  return (
    <article className={`gc-kpi gc-kpi--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  )
}

function CommandLoading() {
  return (
    <div className="gc-gate">
      <div className="gc-loader" />
      <p>Loading Distribution Tracker</p>
    </div>
  )
}

function CommandGate({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="gc-gate">
      <div className="gc-gate-card">
        <span>M</span>
        <h1>{title}</h1>
        <p>{detail}</p>
        <Link href="/login">Sign in</Link>
      </div>
    </div>
  )
}

function AccessRequestGate({ token }: { token: string }) {
  const requestMutation = useMutation({
    mutationFn: (note: string) => growth.requestAccess(token, note || undefined),
  })
  const status = requestMutation.data?.status
  const done = requestMutation.isSuccess

  return (
    <div className="gc-gate">
      <div className="gc-gate-card">
        <span>M</span>
        <h1>Distribution Tracker is restricted</h1>
        {done ? (
          <p>
            {status === "granted"
              ? "You already have access — refresh the page."
              : "Request sent. You'll get access once an owner approves it."}
          </p>
        ) : (
          <>
            <p>This surface is limited to approved Myro operators. Request access with the email you&apos;re signed in with.</p>
            <button
              type="button"
              onClick={() => requestMutation.mutate("")}
              disabled={requestMutation.isPending}
            >
              {requestMutation.isPending ? "Requesting…" : "Request access"}
            </button>
            {requestMutation.isError ? (
              <p className="gc-gate-error">
                {requestMutation.error instanceof Error
                  ? requestMutation.error.message
                  : "Could not send the request. Try again."}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
