"use client"

import { useEffect, useRef, useState } from "react"

interface Props {
  initial: string | null
  onSave: (notes: string) => void
  /** The fourth beat. A note saves on blur, so without this the writer clicks
   *  away and never learns whether their interview note landed. */
  saveState?: "idle" | "saving" | "saved" | "failed"
}

export function NotesEditor({ initial, onSave, saveState = "idle" }: Props) {
  const [open, setOpen] = useState(Boolean(initial && initial.length > 0))
  const [value, setValue] = useState(initial ?? "")
  const dirtyRef = useRef(false)

  useEffect(() => {
    setValue(initial ?? "")
    dirtyRef.current = false
  }, [initial])

  function handleBlur() {
    if (!dirtyRef.current) return
    onSave(value.trim())
    dirtyRef.current = false
  }

  if (!open) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        style={{
          fontSize: 11, color: "var(--tm-text-faint)",
          background: "transparent", border: "none", padding: "4px 0",
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        + Note
      </button>
    )
  }

  return (
    <>
      <textarea
        value={value}
        onChange={e => { setValue(e.target.value); dirtyRef.current = true }}
        onBlur={handleBlur}
        onClick={e => e.stopPropagation()}
        rows={2}
        placeholder="Note…"
        aria-busy={saveState === "saving" || undefined}
        style={{
          width: "100%", marginTop: 6,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid var(--tm-border)", borderRadius: 6,
          padding: "6px 8px", fontSize: 12,
          color: "var(--tm-text)", fontFamily: "inherit",
          resize: "vertical", outline: "none", boxSizing: "border-box",
        }}
      />
      {saveState !== "idle" && (
        <div
          role="status"
          style={{
            fontSize: 11, marginTop: 4,
            color: saveState === "failed" ? "var(--tm-danger)" : "var(--tm-text-faint)",
          }}
        >
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Not saved"}
        </div>
      )}
    </>
  )
}
