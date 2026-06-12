"use client"

import type {
  GrowthCampaign,
  GrowthContentAsset,
  GrowthMessage,
} from "@/lib/api"

interface Props {
  messages: GrowthMessage[]
  assets: Record<string, GrowthContentAsset>
  campaigns: Record<string, GrowthCampaign>
  selectedId: string | null
  onSelect: (messageId: string) => void
}

function plannedLabel(value: string | null): string {
  if (!value) return "Unscheduled"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unscheduled"
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function GrowthTable({
  messages,
  assets,
  campaigns,
  selectedId,
  onSelect,
}: Props) {
  return (
    <div className="gc-table-wrap">
      <table aria-label="Distribution messages">
        <thead>
          <tr>
            <th>Planned</th>
            <th>Platform</th>
            <th>Format</th>
            <th>Message</th>
            <th>Asset</th>
            <th>Status</th>
            <th><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          {messages.map((message) => {
            const asset = message.asset_id ? assets[message.asset_id] : undefined
            const campaign = message.campaign_id
              ? campaigns[message.campaign_id]
              : undefined
            const active = selectedId === message.id
            return (
              <tr key={message.id} data-selected={active ? "true" : "false"}>
                <td className="gc-date">{plannedLabel(message.planned_at)}</td>
                <td>
                  <span className={`gc-channel gc-channel--${message.channel}`}>
                    {message.channel.replaceAll("_", " ")}
                  </span>
                </td>
                <td className="gc-format">{message.format ?? "post"}</td>
                <td>
                  <button
                    type="button"
                    className="gc-message-select"
                    onClick={() => onSelect(message.id)}
                    aria-pressed={active}
                  >
                    <strong>{campaign?.name || asset?.title || "Untitled message"}</strong>
                    <span>{(message.final_copy || message.draft_copy).slice(0, 110)}</span>
                  </button>
                </td>
                <td>
                  {asset?.canonical_url ? (
                    <a href={asset.canonical_url} target="_blank" rel="noreferrer">
                      {asset.title}
                    </a>
                  ) : (
                    <span>{asset?.title ?? "Operational response"}</span>
                  )}
                </td>
                <td>
                  <span className={`gc-status gc-status--${message.status}`}>
                    {message.status.replaceAll("_", " ")}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="gc-review-button"
                    onClick={() => onSelect(message.id)}
                  >
                    Review
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {messages.length === 0 ? (
        <div className="gc-empty">No messages match these filters.</div>
      ) : null}
    </div>
  )
}
