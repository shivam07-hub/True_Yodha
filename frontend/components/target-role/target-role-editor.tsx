"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Loader2, Pencil, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useEditTargetRole } from "@/lib/hooks/use-edit-target-role"

interface Props {
  /** Current primary target role the score + matches are measured against. */
  role: string | null | undefined
  /**
   * Compact label prefix for the display row, e.g. "Scored for". Omit on dense
   * surfaces (jobs filter) where the context already reads as a role control.
   */
  label?: string
  /** Called after a successful save (e.g. close a parent sheet). */
  onSaved?: (role: string) => void
}

const INPUT_STYLE: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "7px 10px",
  borderRadius: "var(--tm-radius-sm)",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid var(--tm-border-soft)",
  color: "var(--tm-text)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color var(--tm-dur) var(--tm-ease), box-shadow var(--tm-dur) var(--tm-ease)",
}

/**
 * Canonical, shared "edit target role" control (issue #145, decision A).
 *
 * One control reused by the score header, the jobs filter, and Settings so the
 * primary role — the single input behind both the Myro Score and job matching —
 * is editable wherever the user confronts its effect, always through the same
 * recompute-wired write path. Design-over-words: the affordance is the pencil
 * and the input; pending and error are visual states, not captions.
 */
export function TargetRoleEditor({ role, label, onSaved }: Props) {
  const edit = useEditTargetRole()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(role ?? "")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue(role ?? "")
      edit.reset()
      requestAnimationFrame(() => inputRef.current?.select())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const trimmed = value.trim()
  const canSave = trimmed.length >= 2 && trimmed !== (role ?? "") && !edit.isPending

  function save() {
    if (!canSave) return
    edit.mutate(trimmed, {
      onSuccess: () => {
        setOpen(false)
        onSaved?.(trimmed)
      },
    })
  }

  if (open) {
    return (
      <span className="tm-role-editor" style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save()
            if (e.key === "Escape") setOpen(false)
          }}
          aria-label="Target role"
          aria-invalid={edit.isError || undefined}
          placeholder="e.g. Data Analyst"
          style={{
            ...INPUT_STYLE,
            borderColor: edit.isError ? "var(--tm-danger)" : "var(--tm-int-border)",
            boxShadow: edit.isError ? "none" : "0 0 0 2px var(--tm-int-bg-hover)",
          }}
        />
        <Button variant="solid" size="icon-sm" onClick={save} disabled={!canSave} aria-label="Save role" title="Save role">
          {edit.isPending ? <Loader2 className="animate-spin" /> : <Check />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Cancel" title="Cancel">
          <X />
        </Button>
      </span>
    )
  }

  if (!role) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil /> Set target role
      </Button>
    )
  }

  return (
    <span className="tm-role-editor" style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <span style={{ color: "var(--tm-text-muted)", fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label ? `${label}: ` : ""}
        <strong style={{ color: "var(--tm-text)", fontWeight: 600 }}>{role}</strong>
      </span>
      <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label="Edit target role" title="Edit target role">
        <Pencil />
      </Button>
    </span>
  )
}
