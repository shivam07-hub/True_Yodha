/**
 * BulletMerge — combine two selected bullets into one.
 *
 * Object-action on TWO bullets picked from the same experience/project item
 * (near-duplicate wins, or a filler line saying nothing its sibling doesn't
 * already say — the CV-dump pileup a heavy Myro user hits). Mentor proposes one
 * line carrying everything both originals stated; nothing changes until
 * "Merge into one line". Same no-DELETION guard as rewrite, applied to the pair.
 */
"use client"

import { useEffect, useState } from "react"
import { cv as cvApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Icon } from "./icons"

export interface MergePayload {
  oldTextA: string
  oldTextB: string
  mergedText: string
  section: "exp_bullet" | "proj_bullet"
  itemIndex: number
  bulletIndexA: number
  bulletIndexB: number
}

interface BulletMergeProps {
  token: string
  bulletA: { text: string; bulletIndex: number }
  bulletB: { text: string; bulletIndex: number }
  section: "exp_bullet" | "proj_bullet"
  itemIndex: number
  role?: string | null
  applying?: boolean
  onApply: (payload: MergePayload) => void
  onDiscard: () => void
}

type Phase = "loading" | "merge" | "error"

export function BulletMerge({
  token, bulletA, bulletB, section, itemIndex, role, applying, onApply, onDiscard,
}: BulletMergeProps) {
  const [phase, setPhase] = useState<Phase>("loading")
  const [mergedText, setMergedText] = useState("")
  const [errMsg, setErrMsg] = useState<string | null>(null)

  async function run() {
    setPhase("loading"); setErrMsg(null)
    try {
      const res = await cvApi.mergeBullet(token, { bullet_a: bulletA.text, bullet_b: bulletB.text, role })
      if (res.mode === "merge" && res.merged_text) {
        setMergedText(res.merged_text)
        setPhase("merge")
      } else {
        setErrMsg(res.rationale ?? "Merge is unavailable right now.")
        setPhase("error")
      }
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Merge is unavailable. Try again.")
      setPhase("error")
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void run() }, [bulletA.text, bulletB.text])

  return (
    <div className="cvb-rw-panel cvb-merge-bar" role="group" aria-label="Merge suggestion">
      <div className="cvb-rw-original" title="First selected line">{bulletA.text}</div>
      <div className="cvb-rw-original" title="Second selected line">{bulletB.text}</div>

      {phase === "loading" && (
        <div className="cvb-rw-status" role="status">✦ Mentor is combining these two lines…</div>
      )}

      {phase === "merge" && (
        <>
          <div className="cvb-rw-diff-new">{mergedText}</div>
          <div className="cvb-rw-actions">
            <Button variant="neutral" size="sm" onClick={onDiscard} disabled={applying}>Discard</Button>
            <Button
              size="sm"
              disabled={applying || !mergedText.trim()}
              onClick={() => onApply({
                oldTextA: bulletA.text,
                oldTextB: bulletB.text,
                mergedText: mergedText.trim(),
                section,
                itemIndex,
                bulletIndexA: bulletA.bulletIndex,
                bulletIndexB: bulletB.bulletIndex,
              })}
            >
              <Icon name="check" size={12}/> {applying ? "Merging…" : "Merge into one line"}
            </Button>
          </div>
        </>
      )}

      {phase === "error" && (
        <div className="cvb-rw-error" role="alert">
          <span>{errMsg}</span>
          <button type="button" className="cvb-rw-skip" onClick={() => void run()}>Try again</button>
          <button type="button" className="cvb-rw-skip" onClick={onDiscard}>Dismiss</button>
        </div>
      )}
    </div>
  )
}
