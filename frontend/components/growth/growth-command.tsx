"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowUpRight, BarChart3, FileText, Radio, Search, Send } from "lucide-react"
import {
  growth,
  type GrowthMessageUpdate,
  type GrowthPublicationCreate,
} from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { getAccessToken } from "@/lib/session"
import { GrowthFilters, type GrowthFilterState } from "./growth-filters"
import { GrowthReviewDrawer } from "./growth-review-drawer"
import { GrowthTable } from "./growth-table"

const INITIAL_FILTERS: GrowthFilterState = {
  channel: "all",
  status: "all",
  format: "all",
}

export function GrowthCommand() {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const [filters, setFilters] = useState(INITIAL_FILTERS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const didAutoSelect = useRef(false)

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
  const approveMutation = useMutation({
    mutationFn: (id: string) => growth.approveMessage(token!, id),
    onSuccess: refresh,
  })
  const publishMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: GrowthPublicationCreate }) =>
      growth.publishMessage(token!, id, body),
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
  const messages = useMemo(() => data?.messages ?? [], [data?.messages])
  const filtered = messages.filter((message) =>
    (filters.channel === "all" || message.channel === filters.channel) &&
    (filters.status === "all" || message.status === filters.status) &&
    (filters.format === "all" || message.format === filters.format),
  )
  const selected =
    messages.find((message) => message.id === selectedId) ?? null

  useEffect(() => {
    if (!didAutoSelect.current && !selectedId && messages.length > 0) {
      didAutoSelect.current = true
      setSelectedId(
        messages.find((message) => message.status === "ready_for_review")?.id ??
          messages[0].id,
      )
    }
  }, [messages, selectedId])

  async function runAction(
    name: string,
    success: string,
    action: () => Promise<unknown>,
  ) {
    setPendingAction(name)
    setFeedback(null)
    try {
      await action()
      setFeedback(success)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Action failed.")
    } finally {
      setPendingAction(null)
    }
  }

  if (token === undefined) return <CommandLoading />
  if (!token) {
    return (
      <CommandGate
        title="Sign in to Growth Command"
        detail="This surface is available only to approved Myro operators."
      />
    )
  }
  if (commandQuery.isLoading) return <CommandLoading />
  if (commandQuery.isError || !data) {
    return (
      <CommandGate
        title="Growth Command is restricted"
        detail={commandQuery.error instanceof Error
          ? commandQuery.error.message
          : "Your account is not on the active operator list."}
      />
    )
  }

  const reviewCount = messages.filter(
    (message) => message.status === "ready_for_review",
  ).length
  const approvedCount = messages.filter(
    (message) => message.status === "approved",
  ).length
  const channelCount = new Set(messages.map((message) => message.channel)).size

  return (
    <div className="gc-shell">
      <aside className="gc-rail">
        <Link href="/admin/growth" className="gc-brand">
          <span>M</span><strong>Myro Growth</strong>
        </Link>
        <nav aria-label="Growth Command sections">
          <a href="#today" data-active="true"><Radio size={17} /><span>Today</span></a>
          <a href="#content"><FileText size={17} /><span>Content</span></a>
          <a href="#distribution"><Send size={17} /><span>Distribution</span></a>
          <a href="#performance"><BarChart3 size={17} /><span>Performance</span><small>Soon</small></a>
          <a href="#signals"><Search size={17} /><span>Signals</span><small>Soon</small></a>
        </nav>
        <div className="gc-operator">
          <span>{data.operator.display_name?.slice(0, 1) || "S"}</span>
          <div><strong>{data.operator.display_name || "Operator"}</strong><small>{data.operator.role}</small></div>
        </div>
      </aside>

      <main className="gc-main">
        <header className="gc-page-header">
          <div>
            <span className="gc-eyebrow">Friday · Career intelligence operations</span>
            <h1>Growth Command</h1>
            <p>Move one useful answer from evidence to the person who needs it.</p>
          </div>
          <a href="https://www.himyro.com/newsletter/" target="_blank" rel="noreferrer">
            View public library <ArrowUpRight size={15} />
          </a>
        </header>

        <section id="today" className="gc-priority-grid" aria-label="Today's priorities">
          <PriorityCard
            tone="amber"
            label="Needs judgement"
            value={reviewCount}
            detail="Channel drafts waiting for review"
            action="Open queue"
            onClick={() => setFilters({ ...INITIAL_FILTERS, status: "ready_for_review" })}
          />
          <PriorityCard
            tone="blue"
            label="Ready to publish"
            value={approvedCount}
            detail="Approved messages missing live evidence"
            action="Publish next"
            onClick={() => setFilters({ ...INITIAL_FILTERS, status: "approved" })}
          />
          <PriorityCard
            tone="green"
            label="Live evidence"
            value={data.publications.length}
            detail="Publication records captured"
            action="Inspect"
            onClick={() => setFilters({ ...INITIAL_FILTERS, status: "published" })}
          />
        </section>

        <section className="gc-truth-strip" aria-label="Command metrics">
          <Metric value={data.assets.length} label="Canonical assets" />
          <Metric value={data.campaigns.length} label="Campaigns" />
          <Metric value={messages.length} label="Messages" />
          <Metric value={channelCount} label="Active channels" />
        </section>

        <div className="gc-command-grid">
          <section id="distribution" className="gc-distribution">
            <div className="gc-section-heading">
              <div>
                <span className="gc-eyebrow">Distribution studio</span>
                <h2>Every message, one source of truth</h2>
              </div>
              <span>{filtered.length} shown</span>
            </div>
            <GrowthFilters value={filters} messages={messages} onChange={setFilters} />
            <GrowthTable
              messages={filtered}
              assets={assets}
              campaigns={campaigns}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </section>

          <GrowthReviewDrawer
            message={selected}
            asset={selected?.asset_id ? assets[selected.asset_id] ?? null : null}
            campaign={selected?.campaign_id ? campaigns[selected.campaign_id] ?? null : null}
            pendingAction={pendingAction}
            feedback={feedback}
            onClose={() => setSelectedId(null)}
            onSave={(id, body) =>
              runAction("save", "Draft saved.", () =>
                saveMutation.mutateAsync({ id, body }))}
            onApprove={(id) =>
              runAction("approve", "Message approved.", () =>
                approveMutation.mutateAsync(id))}
            onPublish={(id, body) =>
              runAction("publish", "Publication recorded.", () =>
                publishMutation.mutateAsync({ id, body }))}
          />
        </div>
      </main>
    </div>
  )
}

function PriorityCard({
  tone, label, value, detail, action, onClick,
}: {
  tone: string
  label: string
  value: number
  detail: string
  action: string
  onClick: () => void
}) {
  return (
    <button type="button" className={`gc-priority gc-priority--${tone}`} onClick={onClick}>
      <span>{label}</span><strong>{value}</strong><p>{detail}</p><small>{action} →</small>
    </button>
  )
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div><strong>{value}</strong><span>{label}</span></div>
}

function CommandLoading() {
  return <div className="gc-gate"><div className="gc-loader" /><p>Loading Growth Command</p></div>
}

function CommandGate({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="gc-gate">
      <div className="gc-gate-card"><span>M</span><h1>{title}</h1><p>{detail}</p><Link href="/login">Sign in</Link></div>
    </div>
  )
}
