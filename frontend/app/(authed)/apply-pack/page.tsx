"use client"

/**
 * The Apply Pack (ENG2/ENG3/ENG5): 500 Myro Coins, one Human Check and a
 * 30-minute call with the reviewer, ₹199 once.
 * Also the landing for the LinkedIn Services door (`/job-switch-plan` forwards
 * here with its query intact, so the attribution survives).
 */

import { useEffect, useState } from "react"
import Link from "next/link"

import { ApplyPackBuy } from "@/components/apply-pack/apply-pack-buy"
import { heldCheck, useHumanChecks } from "@/components/apply-pack/use-human-checks"
import { SalePage } from "@/components/sale-gate"
import { captureAttribution } from "@/lib/attribution"
import { getAccessToken } from "@/lib/session"
import { rupees, useCatalogue } from "@/lib/use-catalogue"
import "@/components/apply-pack/apply-pack.css"

export default function ApplyPackPage() {
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const [signupHref, setSignupHref] = useState("/signup")
  const catalogueQ = useCatalogue()
  const checksQ = useHumanChecks(token ?? null)

  useEffect(() => {
    setToken(getAccessToken())
    captureAttribution(window.location.href)
    const source = new URLSearchParams(window.location.search).get("utm_source")
    if (source) setSignupHref(`/signup?utm_source=${encodeURIComponent(source)}`)
  }, [])

  const pack = catalogueQ.data?.products.find((p) => p.alias === "apply_pack")
  const held = heldCheck(checksQ.data)
  const price = pack ? rupees(pack.price_paise) : null

  return (
    <SalePage pitch={held ? false : true}>
      <main className="ap-page tm-page-enter">
        <header className="ap-head">
          <h1>Apply Pack</h1>
          <p>For the job that matters. Bought once, when you need it.</p>
        </header>

        <ul className="ap-contents">
          <li>
            <span className="ap-k">Myro Coins</span>
            <span>{pack ? pack.coins : 500} · enough for 10 tailored CVs</span>
          </li>
          <li>
            <span className="ap-k">Human Check</span>
            <span>
              A named reviewer reads your tailored CV against one job, or rewrites your LinkedIn. A person,
              not AI. Back within 24 hours.
            </span>
          </li>
          <li>
            <span className="ap-k">Call</span>
            <span>30 minutes with your reviewer, booked on WhatsApp</span>
          </li>
          {price ? (
            <li>
              <span className="ap-k">Price</span>
              <span>{price}, once</span>
            </li>
          ) : null}
        </ul>

        {held ? (
          <section className="ap-held" aria-label="Your Human Check">
            <span>You hold a Human Check.</span>
            <div className="ap-held-uses">
              <Link className="tm-link" href="/collections">Use it on a job</Link>
              <Link className="tm-link" href="/cv?view=cv#linkedin">Use it on LinkedIn</Link>
            </div>
          </section>
        ) : null}

        {token === null ? (
          <Link className="tm-btn-primary" href={signupHref}>
            Start with your free score
          </Link>
        ) : token ? (
          <ApplyPackBuy />
        ) : null}
      </main>
    </SalePage>
  )
}
