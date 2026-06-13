"use client"

import { useEffect, useState } from "react"
import type {
  GrowthContentAsset,
  GrowthMessage,
  GrowthMessageUpdate,
  GrowthMetricUpdate,
  GrowthPublication,
  GrowthPublicationCreate,
} from "@/lib/api"

export function GrowthMetricInput({
  label,
  value,
  disabled,
  onSave,
}: {
  label: string
  value: string
  disabled: boolean
  onSave: (value: number | null) => Promise<void>
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  return (
    <input
      className="gc-number"
      type="number"
      min="0"
      aria-label={label}
      value={draft}
      disabled={disabled}
      placeholder="—"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void onSave(draft === "" ? null : Number(draft))}
    />
  )
}

export function GrowthWorkbench({
  message,
  asset,
  publication,
  onSave,
  onPublish,
}: {
  message: GrowthMessage
  asset: GrowthContentAsset | undefined
  publication: GrowthPublication | undefined
  onSave: (messageId: string, body: GrowthMessageUpdate) => Promise<void>
  onPublish: (
    messageId: string,
    body: GrowthPublicationCreate,
  ) => Promise<void>
}) {
  const [draft, setDraft] = useState(message.draft_copy)
  const [finalCopy, setFinalCopy] = useState(
    publication?.final_copy_snapshot || message.final_copy || "",
  )
  const [liveUrl, setLiveUrl] = useState(publication?.live_url || "")
  const [feedback, setFeedback] = useState("")
  const [busy, setBusy] = useState(false)
  const preparedBaseline =
    typeof message.metadata.prepared_draft === "string"
      ? message.metadata.prepared_draft
      : message.draft_copy

  async function saveDraft(): Promise<void> {
    if (publication) return
    setBusy(true)
    setFeedback("")
    try {
      await onSave(message.id, {
        draft_copy: draft,
        final_copy: finalCopy || null,
        status: message.status === "paused" ? "paused" : "ready_for_review",
      })
      setFeedback("Saved")
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  async function markPosted(): Promise<void> {
    if (!finalCopy.trim() || !liveUrl.trim()) return
    setBusy(true)
    setFeedback("")
    try {
      await onSave(message.id, {
        draft_copy: draft,
        final_copy: finalCopy.trim(),
        status: "ready_for_review",
      })
      await onPublish(message.id, {
        live_url: liveUrl.trim(),
        final_copy_snapshot: finalCopy.trim(),
      })
      setFeedback("Posted version recorded")
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Publish failed")
    } finally {
      setBusy(false)
    }
  }

  const sourceUrl = message.call_to_action_url
  return (
    <div className="gc-workbench">
      <div className="gc-work-links">
        {message.composer_url ? (
          <a href={message.composer_url} target="_blank" rel="noreferrer">
            Open composer ↗
          </a>
        ) : null}
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noreferrer">
            Open thread/source ↗
          </a>
        ) : null}
        {asset?.canonical_url && asset.canonical_url !== sourceUrl ? (
          <a href={asset.canonical_url} target="_blank" rel="noreferrer">
            Open Himyro source ↗
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(draft)
            setFeedback("Copied")
          }}
        >
          Copy draft
        </button>
        <span aria-live="polite">{feedback}</span>
      </div>

      <details className="gc-prepared">
        <summary>Prepared baseline</summary>
        <pre>{preparedBaseline}</pre>
      </details>
      <label>
        <span>Draft (edit in place, saved to the backend)</span>
        <textarea
          value={draft}
          readOnly={Boolean(publication)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void saveDraft()}
        />
      </label>
      <label>
        <span>What actually went out</span>
        <textarea
          className="gc-final-copy"
          value={finalCopy}
          readOnly={Boolean(publication)}
          placeholder="Paste the exact published version to close the learning loop."
          onChange={(event) => setFinalCopy(event.target.value)}
          onBlur={() => void saveDraft()}
        />
      </label>
      <div className="gc-publication-row">
        <label>
          <span>Live URL</span>
          <input
            type="url"
            value={liveUrl}
            readOnly={Boolean(publication)}
            placeholder="https://..."
            onChange={(event) => setLiveUrl(event.target.value)}
          />
        </label>
        {!publication ? (
          <>
            <button type="button" disabled={busy} onClick={() => void saveDraft()}>
              {busy ? "Saving..." : "Save draft"}
            </button>
            <button
              type="button"
              className="gc-post-button"
              disabled={busy || !finalCopy.trim() || !liveUrl.trim()}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void markPosted()}
            >
              Mark posted
            </button>
          </>
        ) : (
          <strong>Published copy locked</strong>
        )}
      </div>
    </div>
  )
}

export type GrowthMetricsHandler = (
  publicationId: string,
  body: GrowthMetricUpdate,
) => Promise<void>
