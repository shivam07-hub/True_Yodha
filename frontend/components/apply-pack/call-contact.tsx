"use client"

/**
 * The call every Human Check ends in (ENG5, ARCHITECTURE_PAYMENTS.md §10.1).
 * One line under the check: the number field until we have one, then who
 * calls whom. Gone once the call has happened. The number never comes back
 * from the server, only whether one is on file.
 */

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { humanChecks, type HumanCheck } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import "./apply-pack.css"

export function CallContact({ token, check }: { token: string; check: HumanCheck }) {
  const queryClient = useQueryClient()
  const [number, setNumber] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (check.status === "unassigned" || check.call_closed_at) return null
  if (check.has_contact) {
    return <span className="hc-call">30-min call · we&apos;ll WhatsApp you</span>
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (number.trim() === "") {
      setError("Add a WhatsApp number.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await humanChecks.setContact(token, check.id, number.trim())
      await queryClient.invalidateQueries({ queryKey: dataKeys.humanChecks() })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save it. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="hc-call hc-call-form" onSubmit={save}>
      <input
        className="tm-input hc-call-input"
        inputMode="tel"
        autoComplete="tel"
        aria-label="WhatsApp number for your 30-minute call"
        placeholder="WhatsApp for your 30-min call"
        value={number}
        onChange={(e) => {
          setNumber(e.target.value)
          if (error) setError(null)
        }}
      />
      <Button type="submit" size="sm" variant="outline" loading={busy}>
        {busy ? "Saving…" : "Save"}
      </Button>
      {error ? <span className="ap-buy-error" role="status">{error}</span> : null}
    </form>
  )
}
