"use client"

import { useEffect, useState } from "react"
import type {
  GrowthCampaign,
  GrowthContentAsset,
  GrowthMessage,
  GrowthMessageUpdate,
} from "@/lib/api"

interface Props {
  message: GrowthMessage | null
  asset: GrowthContentAsset | null
  campaign: GrowthCampaign | null
  pendingAction: string | null
  feedback: string | null
  onClose: () => void
  onSave: (messageId: string, body: GrowthMessageUpdate) => Promise<void>
  onApprove: (messageId: string) => Promise<void>
  onPublish: (
    messageId: string,
    body: { live_url: string; external_id?: string | null },
  ) => Promise<void>
}

export function GrowthReviewDrawer({
  message,
  asset,
  campaign,
  pendingAction,
  feedback,
  onClose,
  onSave,
  onApprove,
  onPublish,
}: Props) {
  const [draft, setDraft] = useState("")
  const [finalCopy, setFinalCopy] = useState("")
  const [liveUrl, setLiveUrl] = useState("")
  const [externalId, setExternalId] = useState("")

  useEffect(() => {
    setDraft(message?.draft_copy ?? "")
    setFinalCopy(message?.final_copy ?? "")
    setLiveUrl("")
    setExternalId("")
  }, [message])

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [onClose])

  if (!message) return null
  const busy = pendingAction !== null
  const editableStatus =
    message.status === "paused" ? "paused" : "ready_for_review"

  return (
    <aside className="gc-review-panel" aria-label="Message review">
      <header className="gc-review-header">
        <div>
          <span className="gc-eyebrow">Review queue</span>
          <h2>{campaign?.name || asset?.title || "Channel message"}</h2>
          <p>{message.channel.replaceAll("_", " ")} · {message.format ?? "post"}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close review">
          Close
        </button>
      </header>

      <div className="gc-review-scroll">
        <section className="gc-source-card">
          <span>Source asset</span>
          <strong>{asset?.title ?? "Operational response"}</strong>
          {asset?.canonical_url ? (
            <a href={asset.canonical_url} target="_blank" rel="noreferrer">
              Open canonical page
            </a>
          ) : null}
        </section>

        <label className="gc-field">
          <span>Working draft</span>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
        </label>

        <label className="gc-field">
          <span>What will actually go out</span>
          <textarea
            className="gc-final-copy"
            value={finalCopy}
            onChange={(event) => setFinalCopy(event.target.value)}
            placeholder="Capture the reviewed final version."
          />
        </label>

        <div className="gc-inline-actions">
          <button
            type="button"
            className="gc-button gc-button--secondary"
            disabled={busy}
            onClick={() =>
              onSave(message.id, {
                draft_copy: draft,
                final_copy: finalCopy || null,
                status: editableStatus,
              })
            }
          >
            {pendingAction === "save" ? "Saving..." : "Save draft"}
          </button>
          <button
            type="button"
            className="gc-button gc-button--primary"
            disabled={busy || message.status === "approved"}
            onClick={() => onApprove(message.id)}
          >
            {pendingAction === "approve" ? "Approving..." : "Approve"}
          </button>
        </div>

        <section className="gc-publish-card">
          <div>
            <span className="gc-eyebrow">Publication evidence</span>
            <h3>Close the loop</h3>
          </div>
          {message.composer_url ? (
            <a
              className="gc-composer-link"
              href={message.composer_url}
              target="_blank"
              rel="noreferrer"
            >
              Open composer
            </a>
          ) : null}
          <label className="gc-field">
            <span>Live URL</span>
            <input
              type="url"
              value={liveUrl}
              onChange={(event) => setLiveUrl(event.target.value)}
              placeholder="https://..."
            />
          </label>
          <label className="gc-field">
            <span>External ID</span>
            <input
              value={externalId}
              onChange={(event) => setExternalId(event.target.value)}
              placeholder="Optional platform identifier"
            />
          </label>
          <button
            type="button"
            className="gc-button gc-button--publish"
            disabled={busy || !liveUrl || message.status === "published"}
            onClick={() =>
              onPublish(message.id, {
                live_url: liveUrl,
                external_id: externalId || null,
              })
            }
          >
            {pendingAction === "publish" ? "Recording..." : "Mark published"}
          </button>
        </section>
      </div>
      <p className="gc-feedback" aria-live="polite">{feedback}</p>
    </aside>
  )
}
