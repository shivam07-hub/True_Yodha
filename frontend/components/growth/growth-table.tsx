"use client"

import { Fragment } from "react"
import type {
  GrowthCampaign,
  GrowthContentAsset,
  GrowthMessage,
  GrowthMessageUpdate,
  GrowthPublication,
  GrowthPublicationCreate,
} from "@/lib/api"
import {
  GrowthMetricInput,
  GrowthWorkbench,
  type GrowthMetricsHandler,
} from "./growth-workbench"

interface Props {
  messages: GrowthMessage[]
  assets: Record<string, GrowthContentAsset>
  campaigns: Record<string, GrowthCampaign>
  publications: Record<string, GrowthPublication>
  expandedId: string | null
  onToggle: (messageId: string) => void
  onSave: (messageId: string, body: GrowthMessageUpdate) => Promise<void>
  onPublish: (
    messageId: string,
    body: GrowthPublicationCreate,
  ) => Promise<void>
  onMetrics: GrowthMetricsHandler
}

function displayStatus(status: string): "draft" | "posted" | "paused" {
  if (status === "published" || status === "posted") return "posted"
  if (status === "paused") return "paused"
  return "draft"
}

function plannedDate(value: string | null): string {
  if (!value) return "Unscheduled"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unscheduled"
  return date.toISOString().slice(0, 10)
}

function metricValue(
  publication: GrowthPublication | undefined,
  key: "impressions" | "clicks",
): string {
  const value = publication?.outcome[key]
  return typeof value === "number" ? String(value) : ""
}

export function GrowthTable({
  messages,
  assets,
  campaigns,
  publications,
  expandedId,
  onToggle,
  onSave,
  onPublish,
  onMetrics,
}: Props) {
  return (
    <div className="gc-card gc-table-card">
      <h2>All postings &amp; community responses</h2>
      <div className="gc-table-wrap">
        <table aria-label="Distribution messages">
          <thead>
            <tr>
              <th>Date</th>
              <th>Platform</th>
              <th>Type</th>
              <th>Title / Theme</th>
              <th>Status</th>
              <th>Impressions</th>
              <th>Clicks</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((message) => {
              const asset = message.asset_id
                ? assets[message.asset_id]
                : undefined
              const campaign = message.campaign_id
                ? campaigns[message.campaign_id]
                : undefined
              const publication = publications[message.id]
              const expanded = expandedId === message.id
              return (
                <Fragment key={message.id}>
                  <tr className="gc-main-row">
                    <td>{plannedDate(message.planned_at)}</td>
                    <td>
                      <span className={`gc-pill gc-pill--${message.channel}`}>
                        {message.channel.replaceAll("_", "/")}
                      </span>
                    </td>
                    <td>
                      <span className="gc-type">{message.format || "Post"}</span>
                      <small>{campaign?.slug || ""}</small>
                    </td>
                    <td>
                      {asset?.canonical_url ? (
                        <a href={asset.canonical_url} target="_blank" rel="noreferrer">
                          {campaign?.name || asset.title}
                        </a>
                      ) : (
                        campaign?.name || asset?.title || "Untitled message"
                      )}
                    </td>
                    <td>
                      <select
                        className={`gc-status gc-status--${displayStatus(message.status)}`}
                        value={displayStatus(message.status)}
                        onChange={(event) => {
                          const next = event.target.value
                          if (next === "posted") {
                            onToggle(message.id)
                            return
                          }
                          void onSave(message.id, {
                            status: next === "paused" ? "paused" : "draft",
                          })
                        }}
                        aria-label={`Status for ${campaign?.name || asset?.title || "message"}`}
                      >
                        <option value="draft">draft</option>
                        <option value="posted">posted</option>
                        <option value="paused">paused</option>
                      </select>
                    </td>
                    <td>
                      <GrowthMetricInput
                        label="Impressions"
                        value={metricValue(publication, "impressions")}
                        disabled={!publication}
                        onSave={(value) =>
                          publication
                            ? onMetrics(publication.id, { impressions: value })
                            : Promise.resolve()
                        }
                      />
                    </td>
                    <td>
                      <GrowthMetricInput
                        label="Clicks"
                        value={metricValue(publication, "clicks")}
                        disabled={!publication}
                        onSave={(value) =>
                          publication
                            ? onMetrics(publication.id, { clicks: value })
                            : Promise.resolve()
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="gc-open-button"
                        onClick={() => onToggle(message.id)}
                        aria-expanded={expanded}
                      >
                        {expanded ? "Close ▴" : "Open ▾"}
                      </button>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="gc-work-row">
                      <td colSpan={8}>
                        <GrowthWorkbench
                          key={`${message.id}:${publication?.id ?? "draft"}`}
                          message={message}
                          asset={asset}
                          publication={publication}
                          onSave={onSave}
                          onPublish={onPublish}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {messages.length === 0 ? (
        <div className="gc-empty">No postings match these filters.</div>
      ) : null}
    </div>
  )
}
