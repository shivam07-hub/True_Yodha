"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cv } from "@/lib/api"
import type {
  SkillEditCandidate,
  SkillEditConflict,
  SkillEditRequest,
  SkillEditResponse,
  UserSkillItem,
} from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"

interface Props {
  skill: UserSkillItem
  token: string
  open: boolean
  onClose: () => void
  /** Called once the sync save returns. Parent triggers score-ring shimmer + polling. */
  onSaved: (baselineId: number) => void
}

export function SkillEditDialog({ skill, token, open, onClose, onSaved }: Props) {
  const queryClient = useQueryClient()
  const original = skill.evidence_text?.trim() ?? ""
  const [text, setText] = useState(original)
  const [conflict, setConflict] = useState<SkillEditConflict | null>(null)
  const [chosen, setChosen] = useState<SkillEditCandidate | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Reset state every time the dialog opens for a (potentially) different skill.
  useEffect(() => {
    if (open) {
      setText(original)
      setConflict(null)
      setChosen(null)
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }, [open, original])

  const keywordMissing = useMemo(() => {
    const name = skill.display_name.toLowerCase()
    return name && !text.toLowerCase().includes(name)
  }, [skill.display_name, text])

  const save = useMutation({
    mutationFn: async () => {
      const body: SkillEditRequest = {
        skill_key: skill.key,
        new_text: text.trim(),
        ...(chosen ? {
          section_hint: chosen.section,
          item_index: chosen.item_index,
          bullet_index: chosen.bullet_index,
        } : {}),
      }
      const result = await cv.skillEdit(token, body)
      return result
    },
    onSuccess: (result) => {
      if ("conflict" in result && result.conflict) {
        setConflict(result)
        return
      }
      const saved = result as SkillEditResponse
      // Sync user_skills / scores reflect the eviction immediately; the async
      // re-tag may invalidate again from the parent once polling completes.
      queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
      queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
      onSaved(saved.baseline_id)
      onClose()
    },
  })

  const isPicking = !!conflict && !chosen
  const canSave =
    !!text.trim() &&
    text.trim() !== original &&
    !isPicking &&
    !save.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent style={{ maxWidth: 640 }}>
        <DialogHeader>
          <DialogTitle>Edit CV pointer · {skill.display_name}</DialogTitle>
          <DialogDescription>
            Rewrite the bullet that proves this skill. Saved as a new Main CV baseline — your previous CV stays in the ledger.
          </DialogDescription>
        </DialogHeader>

        {isPicking ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 0" }}>
            <div className="tm-label-caps" style={{ letterSpacing: "0.1em" }}>
              Multiple bullets match — pick the one this skill came from
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {conflict!.candidates.map((c) => (
                <button
                  key={`${c.section}-${c.item_index}-${c.bullet_index}`}
                  onClick={() => { setChosen(c); setText(c.text) }}
                  style={{
                    textAlign: "left", padding: "10px 12px",
                    border: "1px solid var(--tm-border-soft)",
                    borderRadius: "var(--tm-radius-sm)",
                    background: "rgba(255,255,255,0.02)",
                    color: "var(--tm-text)", fontFamily: "inherit",
                    cursor: "pointer", transition: "all 150ms var(--tm-ease)",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--tm-interactive)"; e.currentTarget.style.background = "var(--tm-int-bg-wash)" }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--tm-border-soft)"; e.currentTarget.style.background = "rgba(255,255,255,0.02)" }}
                >
                  <div className="tm-label-caps" style={{ marginBottom: 4, color: "var(--tm-interactive)" }}>{c.label}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--tm-text-muted)" }}>{c.text}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
            <label htmlFor="skill-edit-textarea" className="tm-label-caps" style={{ letterSpacing: "0.1em" }}>
              New CV bullet
            </label>
            <textarea
              id="skill-edit-textarea"
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              style={{
                width: "100%", padding: "12px 14px",
                fontFamily: "var(--tm-font-body)", fontSize: 13, lineHeight: 1.6,
                color: "var(--tm-text)",
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${keywordMissing ? "var(--tm-warning)" : "var(--tm-border-soft)"}`,
                borderRadius: "var(--tm-radius-sm)",
                resize: "vertical",
                outline: "none",
              }}
            />
            {keywordMissing && (
              <div style={{ fontSize: 11, color: "var(--tm-warning)", display: "flex", alignItems: "center", gap: 6 }}>
                <span>⚠</span>
                <span>
                  &ldquo;{skill.display_name}&rdquo; no longer appears in this bullet — the skill may drop unless an LLM-detected synonym is present.
                </span>
              </div>
            )}
            <div style={{
              marginTop: 6, padding: "10px 12px",
              fontSize: 12, lineHeight: 1.55, color: "var(--tm-text)",
              background: "var(--tm-int-bg-subtle)",
              border: "1px solid var(--tm-int-border)",
              borderLeft: "3px solid var(--tm-interactive)",
              borderRadius: "var(--tm-radius-sm)",
              fontFamily: "var(--tm-font-mono)",
            }}>
              <div className="tm-label-caps" style={{ marginBottom: 4, color: "var(--tm-interactive)" }}>Currently in your CV</div>
              {original || <em style={{ fontStyle: "italic", color: "var(--tm-text-faint)" }}>No evidence text on file</em>}
            </div>
          </div>
        )}

        {save.isError && (
          <div role="alert" style={{ fontSize: 11, color: "var(--tm-danger)", marginTop: 4 }}>
            {save.error instanceof Error ? save.error.message : "Save failed"}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <Button variant="outline" size="md" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          {isPicking ? null : (
            <Button
              variant="solid"
              size="md"
              onClick={() => save.mutate()}
              disabled={!canSave}
              loading={save.isPending}
            >
              Save as new baseline
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
