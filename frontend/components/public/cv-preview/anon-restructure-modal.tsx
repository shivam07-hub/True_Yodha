/**
 * AnonRestructureModal — whole-CV "Restructure with Mentor", logged out.
 *
 * Lifted verbatim out of PublicPlayground when that file moved onto the shared
 * WorkstationShell. Unchanged behaviour: Mentor only reorders and tightens the
 * user's own lines, and keeping the proposal sets what gets saved on signup.
 */
"use client"

import { useEffect, useState } from "react"
import { publicCv } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/cv/builder/icons"
import { RestructureLoading } from "@/components/cv/builder/restructure-loading"
import { RestructuredDoc } from "@/components/cv/builder/restructured-doc"

type RsPhase = "loading" | "proposal" | "error"

interface AnonRestructureModalProps {
  cvText: string
  kept: boolean
  onClose: () => void
  onKeep: (text: string) => void
}

export function AnonRestructureModal({ cvText, kept, onClose, onKeep }: AnonRestructureModalProps) {
  const [phase, setPhase] = useState<RsPhase>("loading")
  const [proposed, setProposed] = useState("")
  const [changes, setChanges] = useState<string[]>([])
  const [rationale, setRationale] = useState<string | null>(null)
  const [playbook, setPlaybook] = useState<string | null>(null)
  const [uncertainty, setUncertainty] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function run() {
    setPhase("loading"); setErr(null)
    try {
      const res = await publicCv.restructure({ cv_text: cvText })
      if (res.mode === "proposal" && res.proposed_text) {
        setProposed(res.proposed_text)
        setChanges(res.changes)
        setRationale(res.rationale); setPlaybook(res.playbook); setUncertainty(res.uncertainty)
        setPhase("proposal")
      } else {
        setErr(res.rationale ?? "Restructure is unavailable right now."); setPhase("error")
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Restructure is unavailable. Try again."); setPhase("error")
    }
  }

  // Propose once on mount — the source CV text is fixed for this instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void run() }, [])

  return (
    <div className="cvb-modal-backdrop" role="dialog" aria-modal="true" aria-label="Restructure with Mentor" onClick={onClose}>
      <div className="cvb-modal cvb-rs-modal" onClick={e => e.stopPropagation()}>
        <div className="cvb-modal-head">
          <span><Icon name="sparkle" size={14} /> Restructure with Mentor</span>
          <button type="button" className="cvb-intake-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {phase === "loading" && (
          <div className="cvb-rs-body">
            <RestructureLoading note="Usually about 15 seconds. Mentor only reorders and tightens your lines — it never invents anything." />
          </div>
        )}

        {phase === "error" && (
          <div className="cvb-rs-body">
            <p className="cvb-rs-error" role="alert">{err}</p>
            <div className="cvb-rs-foot">
              <Button variant="neutral" size="sm" onClick={onClose}>Close</Button>
              <Button size="sm" onClick={() => void run()}>Try again</Button>
            </div>
          </div>
        )}

        {phase === "proposal" && (
          <div className="cvb-rs-body">
            {changes.length > 0 && (
              <div className="cvb-rs-changes">
                <div className="cvb-rs-label">What changed</div>
                <ul className="cvb-rs-change-list">
                  {changes.map((c, i) => <li key={i}><Icon name="check" size={12} stroke={3} aria-hidden /> <span>{c}</span></li>)}
                </ul>
              </div>
            )}
            <div className="cvb-rs-preview" aria-label="Proposed CV"><RestructuredDoc text={proposed} /></div>
            {(rationale || playbook || uncertainty) && (
              <details className="cvb-rs-why">
                <summary>Why this works</summary>
                {rationale && <p className="cvb-rs-why-reason">{rationale}</p>}
                {playbook && <p className="cvb-rs-why-src"><span>Playbook</span> {playbook}</p>}
                {uncertainty && <p className="cvb-rs-why-honest"><Icon name="x" size={11} stroke={3} aria-hidden /> {uncertainty} Keep a line only if it&rsquo;s true.</p>}
              </details>
            )}
            <p className="cvp-rs-note">Keeping it sets this as the CV you&rsquo;ll save when you sign up.</p>
            <div className="cvb-rs-foot">
              <Button variant="dismiss" size="sm" onClick={onClose}>Discard</Button>
              <Button size="sm" onClick={() => onKeep(proposed)}>
                <Icon name="check" size={12} /> {kept ? "Replace kept draft" : "Keep this"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
