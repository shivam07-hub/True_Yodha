"use client"

/**
 * The LinkedIn door on the CV page (ENG3). A reviewer rewrites the profile
 * from the CV; the person pastes it on a short call. Myro never logs in as
 * them and never reads their profile; the URL is for the reviewer's eyes.
 *
 * 5,000 coins, or the Apply Pack's Human Check. The card IS the state: the
 * form, the due time, or the signed sections to copy.
 */

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { ApplyPackBuy } from "@/components/apply-pack/apply-pack-buy"
import { LinkedInBlocks } from "@/components/apply-pack/linkedin-blocks"
import { heldCheck, useHumanChecks } from "@/components/apply-pack/use-human-checks"
import { SaleOffer } from "@/components/sale-gate"
import { Button } from "@/components/ui/button"
import { humanChecks } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { formatCount, formatDate, formatDateTime } from "@/lib/format"
import { useCatalogue } from "@/lib/use-catalogue"
import { useXPStore } from "@/store/xpStore"
import "./apply-pack.css"
import "./linkedin-check.css"

export function LinkedInCheckCard({ token }: { token: string }) {
  const queryClient = useQueryClient()
  const checksQ = useHumanChecks(token)
  const catalogueQ = useCatalogue()
  const balance = useXPStore((s) => s.balance)
  const subtractBalance = useXPStore((s) => s.subtractBalance)
  const [url, setUrl] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [busy, setBusy] = useState<"check" | "coins" | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (checksQ.isLoading) return null
  const checks = checksQ.data ?? []
  const mine = checks.find((c) => c.kind === "linkedin") ?? null
  const coins = catalogueQ.data?.human_check.linkedin_coins ?? null

  if (mine?.status === "delivered" && mine.blocks) {
    return (
      <section id="linkedin" className="li-card" aria-label="LinkedIn rewrite">
        <div className="li-card-head">
          <h2 className="li-card-title">LinkedIn rewrite</h2>
          <span className="li-card-meta">
            {mine.pasted_at ? `Pasted ${formatDate(mine.pasted_at, "short")}` : `Written by ${mine.reviewer_name}`}
          </span>
        </div>
        {mine.note ? <p className="li-card-note">{mine.note}</p> : null}
        <LinkedInBlocks blocks={mine.blocks} profileUrl={mine.linkedin_url} />
      </section>
    )
  }

  if (mine) {
    return (
      <section id="linkedin" className="li-card" aria-label="LinkedIn rewrite">
        <div className="li-card-head">
          <h2 className="li-card-title">LinkedIn rewrite</h2>
          <span className="li-card-meta">Due {formatDateTime(mine.due_at ?? "")}</span>
        </div>
        <p className="li-card-note">We will WhatsApp you to book the paste call.</p>
      </section>
    )
  }

  const held = heldCheck(checks)
  const filled = url.trim() !== "" && whatsapp.trim() !== ""

  async function submit(kind: "check" | "coins") {
    if (!filled) {
      setError("Add your LinkedIn URL and WhatsApp number.")
      return
    }
    setBusy(kind)
    setError(null)
    try {
      const intake = { linkedin_url: url.trim(), whatsapp: whatsapp.trim() }
      if (kind === "check" && held) {
        await humanChecks.useOnLinkedIn(token, held.id, intake)
      } else {
        await humanChecks.buyLinkedInWithCoins(token, intake)
        if (coins !== null) subtractBalance(coins)
      }
      await queryClient.invalidateQueries({ queryKey: dataKeys.humanChecks() })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send it. Try again.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <section id="linkedin" className="li-card" aria-label="LinkedIn rewrite">
      <div className="li-card-head">
        <h2 className="li-card-title">LinkedIn rewrite</h2>
        <span className="li-card-meta">Back within 24 hours</span>
      </div>
      <p className="li-card-note">
        A reviewer rewrites your profile from your CV. You paste it on a short call.
      </p>
      <div className="li-form">
        <label className="li-field">
          <span>LinkedIn URL</span>
          <input
            className="tm-input"
            inputMode="url"
            placeholder="linkedin.com/in/you"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <label className="li-field">
          <span>WhatsApp</span>
          <input
            className="tm-input"
            inputMode="tel"
            placeholder="98765 43210"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
          />
        </label>
      </div>
      <div className="li-actions">
        {held ? (
          <Button onClick={() => submit("check")} loading={busy === "check"}>
            {busy === "check" ? "Sending…" : "Use your human check"}
          </Button>
        ) : (
          <>
            {coins !== null && balance >= coins ? (
              <Button variant="outline" onClick={() => submit("coins")} loading={busy === "coins"}>
                {busy === "coins" ? "Sending…" : `Rewrite for ${formatCount(coins)} coins`}
              </Button>
            ) : coins !== null ? (
              <span className="li-card-meta">
                {formatCount(coins)} coins · you have {formatCount(balance)}
              </span>
            ) : null}
            <SaleOffer>
              <ApplyPackBuy />
            </SaleOffer>
          </>
        )}
        {error ? <span className="ap-buy-error" role="status">{error}</span> : null}
      </div>
    </section>
  )
}
