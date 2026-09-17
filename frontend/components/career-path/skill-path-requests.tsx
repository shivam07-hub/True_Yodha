"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { SkillPathCard } from "@/lib/career-skill-path"
import { useLearningPathRequest, useLearningPathWithdraw } from "@/lib/hooks/use-career-skill-path"

function RequestCard({ card }: { card: SkillPathCard }) {
  const request = useLearningPathRequest()
  const withdraw = useLearningPathWithdraw()
  const [flash, setFlash] = useState<string | null>(null)

  async function onRequest() {
    try {
      const res = await request.mutateAsync(card.taxonomy_key)
      setFlash(res.message)
    } catch {
      setFlash("Couldn’t record that request. Try again.")
    }
  }

  return (
    <article className="csp-card">
      <div>
        <h3 className="csp-name">{card.display_name}</h3>
      </div>
      <div className="csp-actions">
        {card.request_status === "recorded" || flash ? (
          <>
            <p className="csp-note" role="status">
              {flash ?? "Demand recorded, we’ll let you know as soon as the assessment is live."}
            </p>
            <button type="button" className="csp-withdraw" onClick={() => withdraw.mutate(card.taxonomy_key)}>
              Withdraw request
            </button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={request.isPending}
            onClick={() => void onRequest()}
          >
            Request this learning path
          </Button>
        )}
      </div>
    </article>
  )
}

export function RequestBoard({ cards }: { cards: SkillPathCard[] }) {
  if (cards.length === 0) return null
  return (
    <section className="csp-band" aria-labelledby="csp-requests">
      <div className="csp-band-head">
        <h2 id="csp-requests" className="csp-band-label">Not live yet</h2>
      </div>
      <div className="csp-cards">
        {cards.map((card) => <RequestCard key={card.taxonomy_key} card={card} />)}
      </div>
    </section>
  )
}
