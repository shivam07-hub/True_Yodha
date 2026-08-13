/**
 * RestructureProposal — whole-CV "Restructure with Mentor"
 * (DESIGN_cv_playground_redesign §6.2, CVJT1).
 *
 * The higher-order sibling of per-bullet BulletRewrite. Mentor proposes a
 * reordered / merged / trimmed version of the WHOLE CV for this job; the user
 * reviews a "What changed" checklist + the proposed CV, then Keeps or Discards.
 * Proposing is free and writes nothing — keeping charges 20 Myro Coins and
 * writes a new polished version. Failed / discarded proposals cost nothing.
 *
 * Never auto-overwrites: Keep creates a NEW version; the source CV is untouched.
 */
"use client"

import { useCallback, useEffect, useState } from "react"
import { cv as cvApi, type CVVersion, type RestructureProposalResponse } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Icon } from "./icons"
import { RestructureLoading } from "./restructure-loading"
import { RestructuredDoc } from "./restructured-doc"

type Phase = "loading" | "proposal" | "applying" | "error"

/** Past-tense action verbs Mentor leads each change with — the verb IS the type
 * of edit (reorder / merge / cut), so surfacing it gives the list real hierarchy. */
const CHANGE_VERBS = new Set([
  "moved", "merged", "cut", "reordered", "trimmed", "tightened", "combined",
  "removed", "promoted", "grouped", "condensed", "rewrote", "split", "reworded",
  "shortened", "elevated", "dropped", "consolidated", "led",
])

/** Split "Moved the Stripe role above the internship" → verb "Moved" + rest.
 * Falls back to no verb when the string doesn't open with a known action word. */
function splitChange(text: string): { verb: string | null; rest: string } {
  const [first, ...tail] = text.trim().split(" ")
  const key = first.toLowerCase().replace(/[^a-z]/g, "")
  if (tail.length && CHANGE_VERBS.has(key)) return { verb: first, rest: " " + tail.join(" ") }
  return { verb: null, rest: text }
}

interface RestructureProposalProps {
  token: string
  versionId: number
  /** What this restructure targets, e.g. "Account Manager I · Amazon". Surfaced
   * as the basis so the user knows what Mentor is tailoring to. */
  targetLabel?: string
  onKept: (version: CVVersion) => void
  onClose: () => void
}

export function RestructureProposal({ token, versionId, targetLabel, onKept, onClose }: RestructureProposalProps) {
  const [phase, setPhase] = useState<Phase>("loading")
  const [data, setData] = useState<RestructureProposalResponse | null>(null)
  const [proposalId, setProposalId] = useState("")
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const propose = useCallback(async () => {
    setPhase("loading"); setErrMsg(null)
    try {
      const res = await cvApi.versions.restructure(token, versionId)
      if (res.mode === "proposal" && res.proposed_text) {
        setData(res)
        setProposalId(crypto.randomUUID())
        setPhase("proposal")
      } else {
        setErrMsg(res.rationale ?? "Restructure is unavailable right now.")
        setPhase("error")
      }
    } catch {
      setErrMsg("Restructure is unavailable. Try again.")
      setPhase("error")
    }
  }, [token, versionId])

  useEffect(() => { void propose() }, [propose])

  // Escape closes (never while a charge is in flight).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && phase !== "applying") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [phase, onClose])

  async function keep() {
    if (!data?.proposed_text || !proposalId) return
    setPhase("applying"); setErrMsg(null)
    try {
      const version = await cvApi.versions.restructureApply(token, versionId, {
        proposed_text: data.proposed_text,
        proposal_id: proposalId,
      })
      onKept(version)
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Could not keep this restructure.")
      setPhase("proposal")
    }
  }

  const cost = data?.cost ?? 20
  const busy = phase === "applying"

  return (
    <div
      className="cvb-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Restructure with Mentor"
      onClick={() => { if (!busy) onClose() }}
    >
      <div className="cvb-modal cvb-rs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cvb-modal-head">
          <Icon name="sparkle" size={14}/> Restructure with Mentor
        </div>

        {phase === "loading" && (
          <div className="cvb-rs-body">
            <RestructureLoading
              note={`Usually about 15 seconds${targetLabel ? ` · tailoring to ${targetLabel}` : ""}. Nothing is invented — only your bullets are reordered, merged or trimmed.`}
            />
          </div>
        )}

        {phase === "error" && (
          <div className="cvb-rs-body">
            <p className="cvb-rs-error" role="alert">{errMsg}</p>
            <div className="cvb-rs-foot">
              <Button variant="neutral" size="sm" onClick={onClose}>Close</Button>
              <Button size="sm" onClick={() => void propose()}>Try again</Button>
            </div>
          </div>
        )}

        {(phase === "proposal" || phase === "applying") && data && (
          <div className="cvb-rs-body">
            {data.changes.length > 0 && (
              <details className="cvb-rs-changes" open>
                <summary>
                  What changed
                  <span className="cvb-rs-count">{data.changes.length}</span>
                </summary>
                <ul className="cvb-rs-change-list">
                  {data.changes.map((c, i) => {
                    const { verb, rest } = splitChange(c)
                    return (
                      <li key={i}>
                        <Icon name="check" size={12} stroke={3} aria-hidden/>
                        <span>{verb && <b className="cvb-rs-change-verb">{verb}</b>}{rest}</span>
                      </li>
                    )
                  })}
                </ul>
              </details>
            )}

            <div className="cvb-rs-preview" aria-label="Proposed CV">
              <RestructuredDoc text={data.proposed_text ?? ""} />
            </div>

            {(data.rationale || data.playbook || data.uncertainty) && (
              <details className="cvb-rs-why" open>
                <summary>Why this works{targetLabel ? ` for ${targetLabel}` : ""}</summary>
                {data.rationale && <p className="cvb-rs-why-reason">{data.rationale}</p>}
                {data.playbook && <p className="cvb-rs-why-src"><span>Playbook</span> {data.playbook}</p>}
                {data.uncertainty && (
                  <p className="cvb-rs-why-honest">
                    <Icon name="x" size={11} stroke={3} aria-hidden/> {data.uncertainty} Keep a line only if it&rsquo;s true.
                  </p>
                )}
              </details>
            )}

            {errMsg && <p className="cvb-rs-error" role="alert">{errMsg}</p>}

            <div className="cvb-rs-foot">
              <Button variant="dismiss" size="sm" onClick={onClose} disabled={busy}>Discard</Button>
              <Button size="sm" onClick={keep} disabled={busy}>
                <Icon name="check" size={12}/> {busy ? "Keeping…" : `Keep · ${cost} Myro Coins`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
