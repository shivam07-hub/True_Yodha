"use client"

/**
 * The one Apply Pack buy control (ENG2/ENG3). Every door renders this: the
 * fuel door (out of coins), the stakes door (a job's Human Check) and the pack
 * page. The price and "ready by" come from the catalogue; with no sellable
 * pack there is no button, never one the server would refuse.
 */

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { checkout } from "@/lib/checkout"
import { dataKeys } from "@/lib/domain-data"
import { formatDateTime } from "@/lib/format"
import { getAccessToken } from "@/lib/session"
import { rupees, sellable, useCatalogue } from "@/lib/use-catalogue"
import { useXPStore } from "@/store/xpStore"
import "./apply-pack.css"

export function ApplyPackBuy({
  jobId,
  label = "Get the Apply Pack",
  onPaid,
}: {
  /** The stakes door: the check arrives queued on this job. */
  jobId?: string
  label?: string
  onPaid?: () => void
}) {
  const queryClient = useQueryClient()
  const catalogueQ = useCatalogue()
  const applyXpChange = useXPStore((s) => s.applyXpChange)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null)

  const pack = sellable(catalogueQ.data, "apply_pack")
  if (!pack) return null
  const offer = catalogueQ.data?.human_check

  async function buy() {
    const token = getAccessToken()
    if (!token) return
    setBusy(true)
    setNote(null)
    const outcome = await checkout({
      token,
      product: "apply_pack",
      jobId,
      name: "Myro · Apply Pack",
      description: `${pack?.coins ?? 500} Myro Coins + one Human Check + a 30-min call`,
    })
    setBusy(false)
    if (outcome.kind === "paid" || outcome.kind === "setting_up") {
      if (outcome.kind === "paid" && outcome.newCoinBalance !== null) {
        applyXpChange({ newBalance: outcome.newCoinBalance, action: "apply_pack" })
      }
      await queryClient.invalidateQueries({ queryKey: dataKeys.humanChecks() })
      await queryClient.invalidateQueries({ queryKey: dataKeys.catalogue() })
      setNote(outcome.kind === "paid" ? null : { tone: "ok", text: "Payment received · setting up your pack" })
      if (outcome.kind === "paid") onPaid?.()
      return
    }
    if (outcome.kind === "unavailable" || outcome.kind === "failed") {
      setNote({ tone: "error", text: outcome.reason })
    }
  }

  return (
    <div className="ap-buy">
      <Button onClick={buy} loading={busy}>
        {busy ? "Paying…" : `${label} · ${rupees(pack.price_paise)}`}
      </Button>
      {offer?.checks_full ? (
        <span className="ap-buy-eta">Human Check ready by {formatDateTime(offer.ready_by)}</span>
      ) : null}
      {note ? (
        <span className={note.tone === "error" ? "ap-buy-error" : "ap-buy-ok"} role="status">
          {note.text}
        </span>
      ) : null}
    </div>
  )
}
