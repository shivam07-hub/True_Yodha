"use client"

/**
 * One Human Check on the reviewer desk: claim, read, write, deliver.
 * A LinkedIn check opens on Myro's draft (written on claim, from the CV); a CV
 * check opens on the job's one document, whose version the delivery records.
 */

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { BlocksEditor, toBlocks, toEditable, type EditableBlocks } from "@/components/review/blocks-editor"
import { Button } from "@/components/ui/button"
import { reviewer, type ReviewerCheck } from "@/lib/api"
import { formatDateTime } from "@/lib/format"

function waLink(number: string | null): string | null {
  const digits = (number ?? "").replace(/\D/g, "")
  return digits ? `https://wa.me/${digits}` : null
}

export function CheckPanel({
  adminToken,
  check,
  onChanged,
}: {
  adminToken: string
  check: ReviewerCheck
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<"claim" | "deliver" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [blocks, setBlocks] = useState<EditableBlocks>(() => toEditable(check.draft))

  useEffect(() => setBlocks(toEditable(check.draft)), [check.id, check.draft])

  const docQ = useQuery({
    queryKey: ["reviewer", "document", check.id],
    queryFn: () => reviewer.document(adminToken, check.id),
    enabled: check.kind === "cv_job" && check.status === "in_review",
  })

  async function run(kind: "claim" | "deliver") {
    setBusy(kind)
    setError(null)
    try {
      if (kind === "claim") {
        await reviewer.claim(adminToken, check.id)
      } else if (check.kind === "linkedin") {
        await reviewer.deliver(adminToken, check.id, { note, blocks: toBlocks(blocks) })
      } else {
        const versionId = docQ.data?.version_id
        if (!versionId) throw new Error("This job has no CV yet. Tailor one before delivering.")
        await reviewer.deliver(adminToken, check.id, { note, reviewed_cv_version_id: versionId })
      }
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not go through. Try again.")
    } finally {
      setBusy(null)
    }
  }

  const wa = waLink(check.contact_whatsapp)
  const flags = check.draft?.flags ?? []

  return (
    <section className="rv-panel" aria-label="Human Check">
      <header className="rv-panel-head">
        <h2>{check.kind === "linkedin" ? "LinkedIn rewrite" : "CV check"}</h2>
        <span className="rv-meta">Due {formatDateTime(check.due_at ?? "")}</span>
      </header>
      <dl className="rv-facts">
        <dt>Buyer</dt>
        <dd>{check.buyer_email ?? check.user_id}</dd>
        {check.kind === "cv_job" ? (
          <>
            <dt>Job</dt>
            <dd>{check.job_id}</dd>
          </>
        ) : (
          <>
            <dt>Profile</dt>
            <dd>
              {check.linkedin_url ? (
                <a className="tm-link" href={check.linkedin_url} target="_blank" rel="noopener noreferrer">
                  {check.linkedin_url}
                </a>
              ) : null}
            </dd>
            <dt>WhatsApp</dt>
            <dd>{wa ? <a className="tm-link" href={wa} target="_blank" rel="noopener noreferrer">{check.contact_whatsapp}</a> : null}</dd>
          </>
        )}
      </dl>

      {check.status === "queued" ? (
        <Button onClick={() => run("claim")} loading={busy === "claim"}>
          {busy === "claim" ? "Claiming…" : "Claim"}
        </Button>
      ) : (
        <>
          {check.kind === "linkedin" ? (
            <>
              {flags.length > 0 ? (
                <ul className="rv-flags">
                  {flags.map((f) => <li key={f}>{f}</li>)}
                </ul>
              ) : null}
              <BlocksEditor value={blocks} onChange={setBlocks} />
            </>
          ) : (
            <pre className="rv-doc">{docQ.data?.body_text ?? (docQ.isLoading ? "Loading." : "No CV for this job yet.")}</pre>
          )}
          <label className="rv-field">
            <span>Note to them</span>
            <textarea className="tm-input rv-area" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <Button onClick={() => run("deliver")} loading={busy === "deliver"}>
            {busy === "deliver" ? "Delivering…" : "Deliver"}
          </Button>
        </>
      )}
      {error ? <p className="rv-error" role="status">{error}</p> : null}
    </section>
  )
}
