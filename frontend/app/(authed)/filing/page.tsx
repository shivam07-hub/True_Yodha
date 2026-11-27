"use client"

/**
 * The ₹599 pack (ENG5, ARCHITECTURE_PAYMENTS.md §10.3): everything in the ₹199
 * Apply Pack, plus the LinkedIn rewrite, a search call, and Myro filing with
 * the person on company career pages. Three calls in all. The intake below is
 * the filing step and what the search call is read against.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { CallContact } from "@/components/apply-pack/call-contact"
import { useHumanChecks } from "@/components/apply-pack/use-human-checks"
import { filingIntake } from "@/lib/api"
import { checkout } from "@/lib/checkout"
import { dataKeys } from "@/lib/domain-data"
import { formatDateTime } from "@/lib/format"
import { SaleOffer } from "@/components/sale-gate"
import { getAccessToken } from "@/lib/session"
import { rupees, sellable, useCatalogue } from "@/lib/use-catalogue"
import "./filing.css"

const CONTENTS = [
  "500 Myro Coins",
  "A person reads your CV against one job, then a 30-minute call",
  "Your LinkedIn rewritten for you to paste on a call",
  "A search call: the roles, the career pages, and how you use AI in your search",
  "Myro files with you on the company career pages for your role",
]

export default function FilingIntakePage() {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null>(null)
  const [role, setRole] = useState("")
  const [cities, setCities] = useState("")
  const [portals, setPortals] = useState("")
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const catalogueQ = useCatalogue()
  const checksQ = useHumanChecks(token)

  useEffect(() => {
    setToken(getAccessToken())
  }, [])

  const intake = useQuery({
    queryKey: ["filing-intake"],
    queryFn: () => filingIntake.get(token as string),
    enabled: !!token,
  })

  useEffect(() => {
    const saved = intake.data
    if (!saved?.saved) return
    setRole(saved.target_role)
    setCities(saved.cities)
    setPortals(saved.portals)
    setConsent(saved.consented)
  }, [intake.data])

  const save = useMutation({
    mutationFn: () =>
      filingIntake.save(token as string, {
        target_role: role,
        cities,
        portals,
        consent,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["filing-intake"], data)
      setError(null)
    },
    onError: () => {
      setError("Role, cities, career pages, and consent come together.")
    },
  })

  async function pay() {
    if (!token) return
    setPaying(true)
    setError(null)
    const outcome = await checkout({
      token,
      product: "filing_intake",
      name: "Myro · ₹599 pack",
      description: "Three calls, your CV, your LinkedIn, and the filing",
    })
    if (outcome.kind === "paid" || outcome.kind === "setting_up") {
      await queryClient.invalidateQueries({ queryKey: ["filing-intake"] })
      await queryClient.invalidateQueries({ queryKey: dataKeys.humanChecks() })
    }
    if (outcome.kind === "setting_up") setError("Payment received · setting up. Refresh in a minute.")
    if (outcome.kind === "unavailable" || outcome.kind === "failed") setError(outcome.reason)
    setPaying(false)
  }

  const paid = intake.data?.paid === true
  const saved = intake.data?.saved === true
  const pack = sellable(catalogueQ.data, "filing_intake")
  const price = pack ? rupees(pack.price_paise) : null
  const search = (checksQ.data ?? []).find((c) => c.kind === "search") ?? null

  return (
    <main className="fi-wrap">
      <p className="fi-kicker">The ₹599 pack</p>
      <h1 className="fi-title">Three calls. Your CV, your LinkedIn, your search.</h1>
      <p className="fi-sub">
        Everything in the Apply Pack, worked through with a person.
        <SaleOffer>{price ? ` ${price}, once.` : null}</SaleOffer>
      </p>
      <ul className="fi-steps fi-contents">
        {CONTENTS.map((line) => <li key={line}>{line}</li>)}
      </ul>

      {paid && token ? (
        <section className="fi-card" aria-label="Your three calls">
          <h2 className="fi-h">Your three calls</h2>
          {search ? (
            <p className="fi-note fi-call">
              <span>
                Search call ·{" "}
                {search.status === "delivered" ? `ready from ${search.reviewer_name}` : `due ${formatDateTime(search.due_at ?? "")}`}
              </span>
              <CallContact token={token} check={search} />
            </p>
          ) : null}
          {search?.note ? <p className="fi-note">{search.note}</p> : null}
          <p className="fi-note fi-uses">
            <Link className="tm-link" href="/collections">Use your CV check on a job</Link>
            <Link className="tm-link" href="/cv?view=cv#linkedin">Start your LinkedIn rewrite</Link>
          </p>
        </section>
      ) : null}

      <section className="fi-card">
        <h2 className="fi-h">How the filing works</h2>
        <ol className="fi-steps">
          <li>You name the role, the cities, and the career pages.</li>
          <li>You approve a CV tailored to a role that is still open.</li>
          <li>On the company page, the extension fills what the CV contains.</li>
          <li>You submit. A confirmation on that page marks the application.</li>
        </ol>
        <p className="fi-note">
          A login, a captcha, or a question absent from the CV stops the filing on that page.
          You finish that part yourself.
        </p>

        <form
          className="fi-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (token) save.mutate()
          }}
        >
          <label>
            Role
            <input value={role} onChange={(event) => setRole(event.target.value)} required />
          </label>
          <label>
            Cities
            <input value={cities} onChange={(event) => setCities(event.target.value)} required />
          </label>
          <label>
            Career pages
            <textarea
              value={portals}
              onChange={(event) => setPortals(event.target.value)}
              rows={3}
              required
            />
          </label>
          <label className="fi-check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              I agree that Myro files with me on these career pages, and that a question absent
              from the CV waits for me.
            </span>
          </label>
          {error ? <p className="fi-error">{error}</p> : null}
          {paid ? (
            <p className="fi-note">
              Paid. Approve each CV on the role, then fill it from the extension on the company page.
            </p>
          ) : null}
          <div className="fi-actions">
            <button type="submit" disabled={!token || !consent || save.isPending}>
              Save
            </button>
            {paid ? null : (
              <SaleOffer>
              <button
                type="button"
                className="fi-pay"
                disabled={!token || !saved || !consent || paying || !pack}
                onClick={() => void pay()}
              >
                {price ? `Pay ${price}` : "Pay"}
              </button>
              </SaleOffer>
            )}
          </div>
        </form>
      </section>
    </main>
  )
}
