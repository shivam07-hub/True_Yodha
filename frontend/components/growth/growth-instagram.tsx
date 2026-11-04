"use client"

import { useState } from "react"
import type { GrowthMessage } from "@/lib/api"
import { formatCount } from "@/lib/format"
import {
  MAX_CAPTION_CHARS,
  MAX_SLIDES,
  orderSlides,
  singleCaptionFrom,
  toInstagramJpeg,
} from "@/lib/growth/instagram"

export type GrowthInstagramHandler = (
  messageId: string,
  slides: Blob[],
  caption: string,
  firstComment: string,
) => Promise<void>

/** Publish a carousel row to @myrojobs: pick the slide files from the laptop,
 *  check the one caption, confirm. The row then shows queued, and the tracker
 *  turns it published with its live link, or failed with Meta's reason. */
export function GrowthInstagramPublish({
  message,
  onPublish,
}: {
  message: GrowthMessage
  onPublish: GrowthInstagramHandler
}) {
  const [files, setFiles] = useState<File[]>([])
  const [caption, setCaption] = useState(() => singleCaptionFrom(message.draft_copy))
  const [comment, setComment] = useState(
    typeof message.metadata.first_comment === "string" ? message.metadata.first_comment : "",
  )
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  if (message.status === "queued") {
    return (
      <div className="gc-instagram" aria-live="polite">
        <strong>Publishing to Instagram…</strong>
      </div>
    )
  }

  const ready =
    files.length >= 2 &&
    files.length <= MAX_SLIDES &&
    caption.trim().length > 0 &&
    caption.length <= MAX_CAPTION_CHARS

  async function publish(): Promise<void> {
    setBusy(true)
    setError("")
    try {
      const slides = await Promise.all(files.map(toInstagramJpeg))
      await onPublish(message.id, slides, caption.trim(), comment.trim())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Publish failed")
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <div className="gc-instagram">
      {message.status === "failed" && message.failure_reason ? (
        <p className="gc-instagram-error" role="alert">
          {message.failure_reason}
        </p>
      ) : null}
      <label>
        <span>Slides</span>
        <input
          type="file"
          accept="image/png,image/jpeg"
          multiple
          disabled={busy}
          onChange={(event) => setFiles(orderSlides(Array.from(event.target.files ?? [])))}
        />
      </label>
      {files.length ? (
        <ol className="gc-instagram-slides">
          {files.map((file) => (
            <li key={file.name}>{file.name}</li>
          ))}
        </ol>
      ) : null}
      <label>
        <span>
          Caption · {formatCount(caption.length)} / {formatCount(MAX_CAPTION_CHARS)}
        </span>
        <textarea
          value={caption}
          disabled={busy}
          onChange={(event) => setCaption(event.target.value)}
        />
      </label>
      <label>
        <span>First comment</span>
        <input
          type="text"
          value={comment}
          disabled={busy}
          onChange={(event) => setComment(event.target.value)}
        />
      </label>
      <div className="gc-instagram-actions">
        {confirming ? (
          <>
            <button
              type="button"
              className="gc-post-button"
              disabled={busy}
              onClick={() => void publish()}
            >
              {busy ? "Publishing…" : `Post ${files.length} slides now`}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="gc-post-button"
            disabled={!ready}
            onClick={() => setConfirming(true)}
          >
            Publish to Instagram
          </button>
        )}
      </div>
      {error ? (
        <p className="gc-instagram-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
