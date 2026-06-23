/**
 * GapSession — "Close gaps with Mentor" (gap-driven rewrite session).
 *
 * Turns the readout's GAPS list into an honest, paced loop. A gap is one of
 * three things and gets the one honest move:
 *   • latent  — you did it, your words don't show it → surface it on its bullet
 *   • shallow — JD wants L4, your CV shows L2 → surface ONE notch (if you can
 *               evidence it), earn the rest in practice
 *   • absent  — you've never done it → practice, never fabricate
 * Plus the flywheel: once practice proves a level the CV doesn't show yet, the
 * session offers to claim it.
 *
 * Stateless + free: surfacing reuses cv.rewriteBullet (propose) → cv.rewriteApply
 * (write a new baseline; SE1–SE17). The no-fabrication guard governs every
 * rewrite — Mentor surfaces what's true, it never invents.
 *
 * Spec: memory/project_gap_driven_rewrite_session.md (GRILL-LOCKED 2026-06-23).
 */
"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  cv as cvApi,
  type BelowLevelCard,
  type GapPlanResponse,
  type HostBulletCard,
  type RewriteBulletResponse,
} from "@/lib/api"
import { Icon } from "./icons"

interface GapSessionProps {
  token: string
  jobId: string
  /** Live JD-match %, owned by the playground; climbs as surfacings land. */
  score: number
  /** Called after each accepted surfacing so the parent refetches the score. */
  onApplied: () => void
  onClose: () => void
}

type DeckCard =
  | ({ kind: "latent" } & HostBulletCard)
  | ({ kind: "shallow" } & BelowLevelCard)

type CardPhase = "intro" | "asking" | "proposing" | "diff" | "resolved" | "error"

function forgeHref(skill: string): string {
  return `/forge?skill=${encodeURIComponent(skill)}`
}

export function GapSession({ token, jobId, score, onApplied, onClose }: GapSessionProps) {
  const [plan, setPlan] = useState<GapPlanResponse | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [resolved, setResolved] = useState(0)

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      setPlan(await cvApi.gapPlan(token, jobId))
    } catch {
      setLoadErr("Couldn't read your gaps. Try again.")
    }
  }, [token, jobId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Walkable deck = latent host-bullet cards + shallow cards that have a located
  // host (so they can offer the surface). Everything else routes to practice in
  // the closing panel. Ordered by the backend's gap-priority `order`.
  const deck = useMemo<DeckCard[]>(() => {
    if (!plan) return []
    const latent: DeckCard[] = plan.host_bullet_cards.map(c => ({ kind: "latent", ...c }))
    const shallow: DeckCard[] = plan.below_level_cards
      .filter(c => c.host)
      .map(c => ({ kind: "shallow", ...c }))
    return [...latent, ...shallow].sort((a, b) => a.order - b.order)
  }, [plan])

  const practiceSkills = useMemo(() => {
    if (!plan) return []
    const below = plan.below_level_cards.filter(c => !c.host)
    return [...plan.absent_skills.map(a => ({
      skill: a.skill, display_name: a.display_name, is_primary: a.is_primary,
      reason: "absent" as const,
    })), ...below.map(b => ({
      skill: b.skill, display_name: b.display_name, is_primary: b.is_primary,
      reason: "shallow" as const,
    }))]
  }, [plan])

  if (loadErr) {
    return (
      <Backdrop onClose={onClose}>
        <div className="cvb-modal cvb-gs-modal">
          <Header score={score} plan={null} onClose={onClose} />
          <div className="cvb-gs-body">
            <p className="cvb-rs-error" role="alert">{loadErr}</p>
            <div className="cvb-gs-foot">
              <button type="button" className="cvb-btn sm" onClick={onClose}>Close</button>
              <button type="button" className="cvb-btn sm primary" onClick={() => void load()}>Try again</button>
            </div>
          </div>
        </div>
      </Backdrop>
    )
  }

  if (!plan) {
    return (
      <Backdrop onClose={onClose}>
        <div className="cvb-modal cvb-gs-modal">
          <Header score={score} plan={null} onClose={onClose} />
          <div className="cvb-gs-body"><div className="cvb-rw-status" role="status">✦ Mentor is reading your gaps…</div></div>
        </div>
      </Backdrop>
    )
  }

  const onDeck = idx < deck.length
  const card = onDeck ? deck[idx] : null

  function advance() { setIdx(i => i + 1) }
  function onResolved() { setResolved(r => r + 1); onApplied(); advance() }

  return (
    <Backdrop onClose={onClose}>
      <div className="cvb-modal cvb-gs-modal" onClick={e => e.stopPropagation()}>
        <Header score={score} plan={plan} onClose={onClose} />

        <div className="cvb-gs-progress" aria-hidden>
          {deck.map((_, i) => (
            <span key={i} className={`cvb-gs-tick${i < idx ? " done" : i === idx ? " active" : ""}`} />
          ))}
        </div>

        <div className="cvb-gs-body">
          {card?.kind === "latent" && (
            <SurfaceCard
              key={`latent-${idx}`} token={token} card={card}
              onResolved={onResolved} onSkip={advance}
            />
          )}
          {card?.kind === "shallow" && (
            <ShallowCard
              key={`shallow-${idx}`} token={token} card={card}
              onResolved={onResolved} onSkip={advance}
            />
          )}
          {!onDeck && (
            <ClosingPanel
              resolved={resolved}
              practiceSkills={practiceSkills}
              upgrades={plan.upgrade_offers}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </Backdrop>
  )
}

// ── Header: the live match number is the climbing anchor ─────────────────────

function Header({ score, plan, onClose }: { score: number; plan: GapPlanResponse | null; onClose: () => void }) {
  return (
    <div className="cvb-modal-head cvb-gs-head">
      <div className="cvb-gs-title">
        <div className="cvb-gs-eyebrow"><Icon name="sparkle" size={12}/> Close gaps with Mentor</div>
        {plan && <div className="cvb-gs-sub">{plan.company ?? "This role"} · {plan.job_title}</div>}
      </div>
      <div className="cvb-gs-meter" aria-label={`JD match ${score}%`}>
        <span className="cvb-gs-meter-num tabnum">{score}<span>%</span></span>
        <span className="cvb-gs-meter-cap">JD match</span>
      </div>
      <button type="button" className="cvb-btn ghost sm" aria-label="Close" onClick={onClose}>
        <Icon name="x" size={16}/>
      </button>
    </div>
  )
}

// ── Latent: surface a hidden skill onto its host bullet ──────────────────────

function SurfaceCard({ token, card, onResolved, onSkip }: {
  token: string; card: HostBulletCard; onResolved: () => void; onSkip: () => void
}) {
  const keywords = card.skills.map(s => s.display_name)
  const { phase, proposed, rationale, citations, applying, propose, accept, reset, errMsg } =
    useRewrite(token, card.bullet_text, keywords, card)

  return (
    <article className="cvb-gs-card">
      <div className="cvb-gs-card-eyebrow surface">Surface a hidden skill</div>
      <h3 className="cvb-gs-card-h">
        This role looks for {keywords.map((k, i) => (
          <span key={k}><strong>{k}</strong>{i < keywords.length - 1 ? ", " : ""}</span>
        ))}.
      </h3>
      <p className="cvb-gs-card-lede">You may already show this here — let&apos;s make it unmistakable.</p>
      <pre className="cvb-gs-bullet">{card.bullet_text}</pre>

      {phase === "intro" && (
        <div className="cvb-gs-actions">
          <button type="button" className="cvb-btn sm ghost" onClick={onSkip}>Not really</button>
          <button type="button" className="cvb-btn sm primary" onClick={() => void propose()}>
            <Icon name="sparkle" size={12}/> Yes, I did this
          </button>
        </div>
      )}

      <RewriteBody
        phase={phase} proposed={proposed} rationale={rationale} citations={citations}
        applying={applying} errMsg={errMsg}
        before={card.bullet_text}
        onAccept={() => void accept(onResolved)} onDiscard={reset} onRetry={() => void propose()}
      />
    </article>
  )
}

// ── Shallow: surface one notch + earn the rest in practice ───────────────────

function ShallowCard({ token, card, onResolved, onSkip }: {
  token: string; card: BelowLevelCard; onResolved: () => void; onSkip: () => void
}) {
  const [anecdote, setAnecdote] = useState("")
  const host = card.host!
  const { phase, proposed, rationale, citations, applying, propose, accept, reset, errMsg } =
    useRewrite(token, host.bullet_text, [card.display_name], host)

  return (
    <article className="cvb-gs-card">
      <div className="cvb-gs-card-eyebrow deepen">Deepen a skill</div>
      <h3 className="cvb-gs-card-h">
        This role wants <strong>L{card.required_level} {card.display_name}</strong>. Your CV shows <strong>L{card.current_level}</strong>.
      </h3>
      <p className="cvb-gs-card-lede">
        Surface what you&apos;ve really done up to <strong>L{card.surface_to}</strong> — then prove the rest in practice.
      </p>
      <pre className="cvb-gs-bullet">{host.bullet_text}</pre>

      {phase === "intro" && (
        <div className="cvb-gs-ask">
          <label className="cvb-gs-ask-q" htmlFor={`anec-${card.skill}`}>
            What&apos;s the most advanced {card.display_name} thing you actually did here?
          </label>
          <input
            id={`anec-${card.skill}`}
            className="cvb-rw-input"
            value={anecdote}
            onChange={e => setAnecdote(e.target.value)}
            placeholder={`e.g. owned the ${card.display_name.toLowerCase()} for a 4-person team`}
            onKeyDown={e => { if (e.key === "Enter" && anecdote.trim()) void propose(anecdote.trim()) }}
          />
          <div className="cvb-gs-actions">
            <Link href={forgeHref(card.skill)} className="cvb-btn sm ghost">
              Earn L{card.required_level} in practice
            </Link>
            <button
              type="button" className="cvb-btn sm primary"
              disabled={!anecdote.trim()} onClick={() => void propose(anecdote.trim())}
            >
              Surface to L{card.surface_to}
            </button>
          </div>
          <div className="cvb-gs-nofab">Myro surfaces what&apos;s true — it never inflates your level.</div>
          <button type="button" className="cvb-rw-skip" onClick={onSkip}>Skip this gap</button>
        </div>
      )}

      <RewriteBody
        phase={phase} proposed={proposed} rationale={rationale} citations={citations}
        applying={applying} errMsg={errMsg}
        before={host.bullet_text}
        onAccept={() => void accept(onResolved)} onDiscard={reset} onRetry={() => void propose(anecdote.trim())}
      />
    </article>
  )
}

// ── Shared rewrite hook (propose via rewriteBullet, accept via rewriteApply) ──

function useRewrite(
  token: string,
  bullet: string,
  keywords: string[],
  host: { section: string; item_index: number; bullet_index: number },
) {
  const [phase, setPhase] = useState<CardPhase>("intro")
  const [proposed, setProposed] = useState("")
  const [rationale, setRationale] = useState<string | null>(null)
  const [citations, setCitations] = useState<string[]>([])
  const [applying, setApplying] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const propose = useCallback(async (metric?: string) => {
    setPhase("proposing"); setErrMsg(null)
    try {
      const res: RewriteBulletResponse = await cvApi.rewriteBullet(token, {
        bullet, missing_keywords: keywords, metric, allow_no_metric: !!metric,
      })
      if (res.mode === "rewrite") {
        setProposed(res.rewritten_text ?? "")
        setRationale(res.rationale ?? null)
        setCitations(res.citations ?? [])
        setPhase("diff")
      } else if (res.mode === "question") {
        // The no-fab metric question — fold the keyword in qualitatively instead
        // of forcing a number; the session already asked for the user's anecdote.
        const retry = await cvApi.rewriteBullet(token, {
          bullet, missing_keywords: keywords, allow_no_metric: true,
        })
        setProposed(retry.rewritten_text ?? "")
        setRationale(retry.rationale ?? null)
        setCitations(retry.citations ?? [])
        setPhase(retry.mode === "rewrite" ? "diff" : "error")
        if (retry.mode !== "rewrite") setErrMsg(retry.rationale ?? "Couldn't surface this.")
      } else {
        setErrMsg(res.rationale ?? "Mentor is unavailable right now.")
        setPhase("error")
      }
    } catch {
      setErrMsg("Mentor is unavailable. Try again.")
      setPhase("error")
    }
  }, [token, bullet, keywords])

  const accept = useCallback(async (done: () => void) => {
    if (!proposed.trim()) return
    setApplying(true); setErrMsg(null)
    try {
      await cvApi.rewriteApply(token, {
        old_text: bullet, new_text: proposed.trim(),
        section_hint: host.section, item_index: host.item_index, bullet_index: host.bullet_index,
      })
      setPhase("resolved")
      done()
    } catch {
      setErrMsg("Couldn't save this change. Try again.")
      setApplying(false)
    }
  }, [token, bullet, proposed, host])

  const reset = useCallback(() => {
    setPhase("intro"); setProposed(""); setRationale(null); setCitations([]); setErrMsg(null)
  }, [])

  return { phase, proposed, rationale, citations, applying, propose, accept, reset, errMsg }
}

// ── Shared rewrite UI (status / diff / error), reusing cvb-rw-* vocabulary ────

function RewriteBody({ phase, proposed, rationale, citations, applying, errMsg, before, onAccept, onDiscard, onRetry }: {
  phase: CardPhase; proposed: string; rationale: string | null; citations: string[]
  applying: boolean; errMsg: string | null; before: string
  onAccept: () => void; onDiscard: () => void; onRetry: () => void
}) {
  if (phase === "proposing") return <div className="cvb-rw-status" role="status">✦ Mentor is surfacing it…</div>
  if (phase === "resolved") return <div className="cvb-gs-resolved" role="status"><Icon name="check" size={14} stroke={3}/> Surfaced</div>
  if (phase === "error") {
    return (
      <div className="cvb-rw-error" role="alert">
        <span>{errMsg}</span>
        <button type="button" className="cvb-rw-skip" onClick={onRetry}>Try again</button>
      </div>
    )
  }
  if (phase === "diff") {
    return (
      <div className="cvb-rw-diff">
        <div className="cvb-rw-diff-tag">before</div>
        <div className="cvb-rw-diff-old">{before}</div>
        <div className="cvb-rw-diff-tag">after</div>
        <div className="cvb-rw-diff-new">{proposed}</div>
        {rationale && <div className="cvb-rw-rationale">{rationale}</div>}
        {citations.length > 0 && (
          <div className="cvb-rw-citation" title="Grounded in the Myro CV Playbook">
            <Icon name="sparkle" size={11}/> Grounded in {citations.join(", ")}
          </div>
        )}
        <div className="cvb-rw-actions">
          <button type="button" className="cvb-btn sm" onClick={onDiscard} disabled={applying}>Discard</button>
          <button type="button" className="cvb-btn sm primary" disabled={applying || !proposed.trim()} onClick={onAccept}>
            <Icon name="check" size={12}/> {applying ? "Saving…" : "Accept"}
          </button>
        </div>
      </div>
    )
  }
  return null
}

// ── Closing panel: build in practice + claim what you've proven ──────────────

function ClosingPanel({ resolved, practiceSkills, upgrades, onClose }: {
  resolved: number
  practiceSkills: { skill: string; display_name: string; is_primary: boolean; reason: "absent" | "shallow" }[]
  upgrades: GapPlanResponse["upgrade_offers"]
  onClose: () => void
}) {
  return (
    <div className="cvb-gs-closing">
      {resolved > 0 && (
        <div className="cvb-gs-tally" role="status">
          <Icon name="check" size={14} stroke={3}/> Surfaced {resolved} skill{resolved === 1 ? "" : "s"} on your CV
        </div>
      )}

      {upgrades.length > 0 && (
        <section className="cvb-gs-section">
          <div className="cvb-gs-section-h proven">You&apos;ve already proven these</div>
          <p className="cvb-gs-section-lede">Practice took these past what your CV shows — claim the higher level.</p>
          {upgrades.map(u => (
            <Link key={u.skill} href={forgeHref(u.skill)} className="cvb-gs-row proven">
              <span className="cvb-gs-row-name">{u.display_name}</span>
              <span className="cvb-gs-row-meta">L{u.from_level} → <strong>L{u.to_level}</strong> proven</span>
            </Link>
          ))}
        </section>
      )}

      {practiceSkills.length > 0 && (
        <section className="cvb-gs-section">
          <div className="cvb-gs-section-h build">Build these in practice</div>
          <p className="cvb-gs-section-lede">The market wants these and your experience doesn&apos;t show them yet — that&apos;s the signal, not a failure.</p>
          {practiceSkills.map(s => (
            <Link key={s.skill} href={forgeHref(s.skill)} className="cvb-gs-row build">
              <span className="cvb-gs-row-name">{s.display_name}</span>
              <span className="cvb-gs-row-meta">
                {s.is_primary && s.reason === "absent" && <span className="cvb-gs-primary-tag">primary requirement</span>}
                Practice →
              </span>
            </Link>
          ))}
        </section>
      )}

      {resolved === 0 && upgrades.length === 0 && practiceSkills.length === 0 && (
        <div className="cvb-gs-tally"><Icon name="check" size={14} stroke={3}/> No gaps to close — your CV already speaks this role.</div>
      )}

      <div className="cvb-gs-foot">
        <button type="button" className="cvb-btn sm primary" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="cvb-modal-backdrop" role="dialog" aria-modal="true" aria-label="Close gaps with Mentor" onClick={onClose}>
      {children}
    </div>
  )
}
