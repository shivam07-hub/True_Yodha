"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { billing, filingIntake } from "@/lib/api"
import { loadRazorpay } from "@/lib/razorpay"
import { getAccessToken } from "@/lib/session"
import "./filing.css"

interface RazorpaySuccess {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

interface RazorpayOptions {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  modal?: { confirm_close?: boolean; ondismiss?: () => void }
  handler: (response: RazorpaySuccess) => void
}

interface RazorpayInstance {
  open: () => void
}

type RazorpayCtor = new (options: RazorpayOptions) => RazorpayInstance

export default function FilingIntakePage() {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null>(null)
  const [role, setRole] = useState("")
  const [cities, setCities] = useState("")
  const [portals, setPortals] = useState("")
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)

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
    const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
    if (!key) {
      setError("Payments are still being connected.")
      return
    }
    setPaying(true)
    setError(null)
    try {
      const Razorpay = await loadRazorpay<RazorpayCtor>()
      if (!Razorpay) {
        setError("Checkout is unavailable. Try again in a moment.")
        setPaying(false)
        return
      }
      const order = await billing.createOrder(token, "filing_intake")
      const checkout = new Razorpay({
        key,
        amount: order.amount,
        currency: order.currency,
        name: "Myro",
        description: "Filing process · ₹599",
        order_id: order.order_id,
        modal: {
          confirm_close: true,
          ondismiss: () => setPaying(false),
        },
        handler: (response) => {
          void (async () => {
            try {
              await billing.verifyPayment(token, response)
              await queryClient.invalidateQueries({ queryKey: ["filing-intake"] })
              setError(null)
            } catch {
              setError("We could not confirm the payment. If you were charged it will reconcile shortly.")
            } finally {
              setPaying(false)
            }
          })()
        },
      })
      checkout.open()
    } catch {
      setError("Checkout could not start.")
      setPaying(false)
    }
  }

  const paid = intake.data?.paid === true
  const saved = intake.data?.saved === true

  return (
    <main className="fi-wrap">
      <p className="fi-kicker">Filing</p>
      <h1 className="fi-title">One role. The company page. You submit.</h1>
      <p className="fi-sub">
        Myro writes one resume for the role you name and fills the company form with you.
        The fee is ₹599, once. The ₹199 Apply Pack stays the pack for coins and a human check.
      </p>

      <section className="fi-card">
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
              <button
                type="button"
                className="fi-pay"
                disabled={!token || !saved || !consent || paying}
                onClick={() => void pay()}
              >
                Pay ₹599
              </button>
            )}
          </div>
        </form>
      </section>
    </main>
  )
}
