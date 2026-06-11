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
import { Icon } from "./icons"

type Phase = "loading" | "proposal" | "applying" | "error"

interface RestructureProposalProps {
  token: string
  versionId: number
  onKept: (version: CVVersion) => void
  onClose: () => void
}

export function RestructureProposal({ token, versionId, onKept, onClose }: RestructureProposalProps) {
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
            <div className="cvb-rw-status" role="status">✦ Mentor is restructuring your CV…</div>
          </div>
        )}

        {phase === "error" && (
          <div className="cvb-rs-body">
            <p className="cvb-rs-error" role="alert">{errMsg}</p>
            <div className="cvb-rs-foot">
              <button type="button" className="cvb-btn sm" onClick={onClose}>Close</button>
              <button type="button" className="cvb-btn sm primary" onClick={() => void propose()}>Try again</button>
            </div>
          </div>
        )}

        {(phase === "proposal" || phase === "applying") && data && (
          <div className="cvb-rs-body">
            {data.changes.length > 0 && (
              <div className="cvb-rs-changes">
                <div className="cvb-rs-label">What changed</div>
                <ul className="cvb-rs-change-list">
                  {data.changes.map((c, i) => (
                    <li key={i}><Icon name="check" size={12} stroke={3} aria-hidden/> <span>{c}</span></li>
                  ))}
                </ul>
              </div>
            )}

            <div className="cvb-rs-preview" aria-label="Proposed CV">
              <pre>{data.proposed_text}</pre>
            </div>

            {(data.rationale || data.playbook || data.uncertainty) && (
              <details className="cvb-rs-why">
                <summary>Why this works</summary>
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
              <button type="button" className="cvb-btn sm" onClick={onClose} disabled={busy}>Discard</button>
              <button type="button" className="cvb-btn sm primary" onClick={keep} disabled={busy}>
                <Icon name="check" size={12}/> {busy ? "Keeping…" : `Keep · ${cost} coins`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
