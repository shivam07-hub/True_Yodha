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
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  cv as cvApi,
  users as usersApi,
  type BelowLevelCard,
  type GapPlanResponse,
  type HostBulletCard,
  type UpgradeOffer,
} from "@/lib/api"
import { useStreamingText, type StreamEvent } from "@/lib/hooks/use-streaming-text"
import { Button } from "@/components/ui/button"
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
  return `/practice?skill=${encodeURIComponent(skill)}`
}

// Cards walked in one sitting before the checkpoint offers to continue. Mirrors
// the backend's gap-priority top-N; the deck is already ordered by it.
const SESSION_BATCH = 5

export function GapSession({ token, jobId, score, onApplied, onClose }: GapSessionProps) {
  const [plan, setPlan] = useState<GapPlanResponse | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  // Per-deck outcome so the bar shows surfaced work (loud) vs skipped (faint) —
  // a "done" tick used to conflate both, so accepted work read as walked-past.
  const [outcomes, setOutcomes] = useState<Record<number, "surfaced" | "skipped">>({})
  // JD-match at the moment the session opened — the floor the header climbs from.
  const [startScore] = useState(score)
  const [revealed, setRevealed] = useState(SESSION_BATCH)
  const surfaced = useMemo(
    () => Object.values(outcomes).filter(o => o === "surfaced").length,
    [outcomes],
  )

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
          <Header score={score} startScore={startScore} plan={null} onClose={onClose} />
          <div className="cvb-gs-body">
            <p className="cvb-rs-error" role="alert">{loadErr}</p>
            <div className="cvb-gs-foot">
              <Button variant="neutral" size="sm" onClick={onClose}>Close</Button>
              <Button size="sm" onClick={() => void load()}>Try again</Button>
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
          <Header score={score} startScore={startScore} plan={null} onClose={onClose} />
          <div className="cvb-gs-body"><div className="cvb-rw-status" role="status">✦ Mentor is reading your gaps…</div></div>
        </div>
      </Backdrop>
    )
  }

  // Pagination: walk the deck in SESSION_BATCH chunks. At a batch boundary with
  // more cards left, the checkpoint lets the user keep going or wrap up early.
  const walkedAll = idx >= deck.length
  const atCheckpoint = !walkedAll && idx >= revealed
  const onDeck = !walkedAll && !atCheckpoint
  const card = onDeck ? deck[idx] : null
  const ticks = Math.min(revealed, deck.length)

  function advance() { setIdx(i => i + 1) }
  function skip() { setOutcomes(o => ({ ...o, [idx]: "skipped" })); advance() }
  function onResolved() { setOutcomes(o => ({ ...o, [idx]: "surfaced" })); onApplied(); advance() }
  function continueBatch() { setRevealed(r => r + SESSION_BATCH) }
  function wrapUp() { setIdx(deck.length) }

  return (
    <Backdrop onClose={onClose}>
      <div className="cvb-modal cvb-gs-modal" onClick={e => e.stopPropagation()}>
        <Header score={score} startScore={startScore} plan={plan} onClose={onClose} />

        {deck.length > 1 && (
          <div className="cvb-gs-progress" aria-hidden>
            {Array.from({ length: ticks }, (_, i) => {
              const o = outcomes[i]
              const cls = o === "surfaced" ? "surfaced" : o === "skipped" ? "skipped" : i === idx ? "active" : ""
              return <span key={i} className={`cvb-gs-tick${cls ? ` ${cls}` : ""}`} />
            })}
            {deck.length > revealed && <span className="cvb-gs-tick-more">+{deck.length - revealed}</span>}
          </div>
        )}

        {surfaced > 0 && (
          <div className="cvb-gs-livetally" role="status">
            <Icon name="check" size={12} stroke={3}/> {surfaced} surfaced
          </div>
        )}

        <div className="cvb-gs-body">
          {card?.kind === "latent" && (
            <SurfaceCard
              key={`latent-${idx}`} token={token} card={card}
              onResolved={onResolved} onSkip={skip}
            />
          )}
          {card?.kind === "shallow" && (
            <ShallowCard
              key={`shallow-${idx}`} token={token} card={card}
              onResolved={onResolved} onSkip={skip}
            />
          )}
          {atCheckpoint && (
            <Checkpoint
              resolved={surfaced}
              remaining={deck.length - idx}
              onContinue={continueBatch}
              onWrap={wrapUp}
            />
          )}
          {walkedAll && (
            <ClosingPanel
              token={token}
              resolved={surfaced}
              startScore={startScore}
              score={score}
              practiceSkills={practiceSkills}
              upgrades={plan.upgrade_offers}
              onApplied={onApplied}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </Backdrop>
  )
}

// ── Header: the live match number is the climbing anchor ─────────────────────

function Header({ score, startScore, plan, onClose }: { score: number; startScore: number; plan: GapPlanResponse | null; onClose: () => void }) {
  return (
    <div className="cvb-modal-head cvb-gs-head">
      <div className="cvb-gs-title">
        <div className="cvb-gs-eyebrow"><Icon name="sparkle" size={12}/> Close gaps with Mentor</div>
        {plan && <div className="cvb-gs-sub">{plan.company ?? "This role"} · {plan.job_title}</div>}
      </div>
      <LiveMeter score={score} startScore={startScore} />
      <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
        <Icon name="x" size={16}/>
      </Button>
    </div>
  )
}

// The match number is the climbing anchor — it count-ups + pulses when an
// accepted surfacing lands, and shows the gain since the session opened so the
// payoff accumulates in view instead of jumping silently on a late refetch.
function LiveMeter({ score, startScore }: { score: number; startScore: number }) {
  const [display, setDisplay] = useState(score)
  const [bumped, setBumped] = useState(false)
  const prev = useRef(score)

  useEffect(() => {
    const from = prev.current
    const to = score
    prev.current = to
    if (from === to) { setDisplay(to); return }

    let bumpTimer: ReturnType<typeof setTimeout> | undefined
    if (to > from) {
      setBumped(true)
      bumpTimer = setTimeout(() => setBumped(false), 600)
    }

    let raf = 0
    let startTs: number | null = null
    const dur = 500
    const step = (ts: number) => {
      if (startTs === null) startTs = ts
      const p = Math.min(1, (ts - startTs) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (to - from) * eased))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); if (bumpTimer) clearTimeout(bumpTimer) }
  }, [score])

  const gain = score - startScore
  return (
    <div className={`cvb-gs-meter${bumped ? " bumped" : ""}`} aria-label={`JD match ${score}%`}>
      <span className="cvb-gs-meter-num tabnum">{display}<span>%</span></span>
      <span className="cvb-gs-meter-cap">
        JD match{gain > 0 && <span className="cvb-gs-meter-gain"> ↑ {gain}</span>}
      </span>
    </div>
  )
}

// ── Latent: surface a hidden skill onto its host bullet ──────────────────────

function SurfaceCard({ token, card, onResolved, onSkip }: {
  token: string; card: HostBulletCard; onResolved: () => void; onSkip: () => void
}) {
  const keywords = card.skills.map(s => s.display_name)
  const { phase, proposed, setProposed, rationale, citations, version, reworking, streaming, applying, propose, refine, accept, reset, errMsg } =
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
      {phase !== "diff" && <pre className="cvb-gs-bullet">{card.bullet_text}</pre>}

      {phase === "intro" && (
        <div className="cvb-gs-actions">
          <Button variant="ghost" size="sm" onClick={onSkip}>Not really</Button>
          <Button size="sm" onClick={() => void propose()}>
            <Icon name="sparkle" size={12}/> Yes, I did this
          </Button>
        </div>
      )}

      <RewriteBody
        phase={phase} proposed={proposed} onProposedChange={setProposed} rationale={rationale} citations={citations}
        version={version} reworking={reworking} streaming={streaming} applying={applying} errMsg={errMsg}
        before={card.bullet_text}
        onAccept={() => void accept(onResolved)} onDiscard={reset} onRetry={() => void propose()}
        onRefine={note => void refine(note)}
      />
    </article>
  )
}

// ── Shallow: surface one notch + earn the rest in practice ───────────────────

function ShallowCard({ token, card, onResolved, onSkip }: {
  token: string; card: BelowLevelCard; onResolved: () => void; onSkip: () => void
}) {
  const [anecdote, setAnecdote] = useState("")
  const anecRef = useRef<HTMLTextAreaElement>(null)
  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }
  const host = card.host!
  const { phase, proposed, setProposed, rationale, citations, version, reworking, streaming, applying, propose, refine, accept, reset, errMsg } =
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
      {phase !== "diff" && <pre className="cvb-gs-bullet">{host.bullet_text}</pre>}

      {phase === "intro" && (
        <div className="cvb-gs-ask">
          <label className="cvb-gs-ask-q" htmlFor={`anec-${card.skill}`}>
            What&apos;s the most advanced {card.display_name} thing you actually did here?
          </label>
          <textarea
            id={`anec-${card.skill}`}
            ref={anecRef}
            rows={1}
            className="cvb-rw-input cvb-rw-area"
            value={anecdote}
            onChange={e => { setAnecdote(e.target.value); autoGrow(e.target) }}
            placeholder={`e.g. owned the ${card.display_name.toLowerCase()} for a 4-person team`}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey && anecdote.trim()) { e.preventDefault(); void propose(anecdote.trim()) }
            }}
          />
          <div className="cvb-gs-actions">
            <Button variant="neutral" size="sm" render={<Link href={forgeHref(card.skill)} target="_blank" rel="noopener noreferrer" />}>
              Earn L{card.required_level} in practice
            </Button>
            <Button
              size="sm"
              disabled={!anecdote.trim()} onClick={() => void propose(anecdote.trim())}
            >
              Surface to L{card.surface_to}
            </Button>
          </div>
          <div className="cvb-gs-nofab">Myro surfaces what&apos;s true — it never inflates your level.</div>
          <button type="button" className="cvb-rw-skip" onClick={onSkip}>Skip this gap</button>
        </div>
      )}

      <RewriteBody
        phase={phase} proposed={proposed} onProposedChange={setProposed} rationale={rationale} citations={citations}
        version={version} reworking={reworking} streaming={streaming} applying={applying} errMsg={errMsg}
        before={host.bullet_text}
        onAccept={() => void accept(onResolved)} onDiscard={reset} onRetry={() => void propose(anecdote.trim())}
        onRefine={note => void refine(note)}
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
  // Draft lineage: v1 = Mentor's first draft, bumped per accepted refine. Lets
  // the UI show "Mentor's draft · v2" so iterating reads as building on top.
  const [version, setVersion] = useState(0)
  const [reworking, setReworking] = useState(false)

  // ADR-0009: the rewrite STREAMS — Mentor types the surfaced bullet instead of
  // showing a dead "surfacing…" spinner. A first draft (propose) live-binds the
  // stream into `proposed` so the diff view types it; a refine swaps on done so
  // the standing draft stays put while Mentor reworks it.
  const stream = useStreamingText()
  const [streaming, setStreaming] = useState(false)
  const modeRef = useRef<"propose" | "refine">("propose")
  const retriedNoFabRef = useRef(false)
  const lastBodyRef = useRef<Record<string, unknown>>({})

  // Live-bind the first-draft stream into the diff as it types (propose only).
  useEffect(() => {
    if (streaming && modeRef.current === "propose" && stream.text) {
      setProposed(stream.text)
      setPhase(p => (p === "proposing" ? "diff" : p))
    }
  }, [streaming, stream.text])

  function startStream(body: Record<string, unknown>, mode: "propose" | "refine") {
    modeRef.current = mode
    lastBodyRef.current = body
    setStreaming(true); setErrMsg(null)
    stream.start(cvApi.rewriteBulletStreamPath, token, onStreamDone, body)
  }

  function onStreamDone(ev: StreamEvent) {
    if (ev.type === "error") {
      setStreaming(false)
      setErrMsg((ev.message as string) ?? "Mentor is unavailable. Try again.")
      // A refine failure keeps the standing draft in view; a first-draft failure
      // has nothing to show, so surface the error card.
      setPhase(modeRef.current === "propose" ? "error" : "diff")
      return
    }
    if (ev.mode === "question" && !retriedNoFabRef.current) {
      // The no-fab metric question — fold the keyword in qualitatively instead of
      // forcing a number; the session already asked for the user's anecdote.
      retriedNoFabRef.current = true
      startStream({ ...lastBodyRef.current, metric: undefined, allow_no_metric: true }, modeRef.current)
      return
    }
    setStreaming(false)
    setProposed((ev.rewritten_text as string) ?? "")
    setRationale((ev.rationale as string) ?? null)
    setCitations((ev.citations as string[]) ?? [])
    setVersion(v => (modeRef.current === "propose" ? 1 : v + 1))
    setPhase("diff")
  }

  const propose = useCallback((metric?: string) => {
    retriedNoFabRef.current = false
    setReworking(false); setProposed(""); setPhase("proposing")
    startStream({ bullet, missing_keywords: keywords, metric, allow_no_metric: !!metric }, "propose")
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Iterate on the *current* proposal instead of starting over: Myro's last
  // draft becomes the base, the user's note is the context it missed. The draft
  // stays on screen (phase holds at "diff") while Mentor reworks it in place, so
  // a refine reads as building on top — not a fresh start. Failure keeps the
  // standing draft in view.
  const refine = useCallback((note: string) => {
    const base = proposed.trim()
    if (!base || !note.trim()) return
    retriedNoFabRef.current = false
    setReworking(true)
    // Streams under the hood but holds the standing draft (no live-bind on
    // refine) until the reworked version lands on `done`.
    startStream({ bullet: base, missing_keywords: keywords, metric: note.trim(), allow_no_metric: true }, "refine")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, proposed, keywords])

  // refine ends on done/error inside onStreamDone; clear the reworking flag there.
  useEffect(() => {
    if (!streaming) setReworking(false)
  }, [streaming])

  const reset = useCallback(() => {
    stream.reset()
    setStreaming(false)
    setPhase("intro"); setProposed(""); setRationale(null); setCitations([])
    setVersion(0); setReworking(false); setErrMsg(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { phase, proposed, setProposed, rationale, citations, version, reworking, streaming, applying, propose, refine, accept, reset, errMsg }
}

// ── Shared rewrite UI (status / diff / error), reusing cvb-rw-* vocabulary ────

function RewriteBody({ phase, proposed, onProposedChange, rationale, citations, version, reworking, streaming, applying, errMsg, before, onAccept, onDiscard, onRetry, onRefine }: {
  phase: CardPhase; proposed: string; onProposedChange: (v: string) => void
  rationale: string | null; citations: string[]
  version: number; reworking: boolean; streaming: boolean
  applying: boolean; errMsg: string | null; before: string
  onAccept: () => void; onDiscard: () => void; onRetry: () => void
  onRefine: (note: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState("")

  function submitRefine() {
    if (!note.trim()) return
    onRefine(note.trim())
    setNote("")
  }

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
    const busy = applying || reworking || streaming
    return (
      <div className={`cvb-rw-diff${reworking ? " reworking" : ""}`} aria-busy={reworking || streaming}>
        <div className="cvb-rw-diff-tag">before</div>
        <div className="cvb-rw-diff-old">{before}</div>
        <div className="cvb-rw-diff-afterhead">
          <span className="cvb-rw-diff-tag">
            Mentor&apos;s draft{version > 1 ? ` · v${version}` : ""}
          </span>
          {reworking ? (
            <span className="cvb-rw-reworking" role="status"><Icon name="sparkle" size={11}/> reworking…</span>
          ) : streaming ? null : (
            <button
              type="button" className="cvb-rw-edit"
              onClick={() => setEditing(e => !e)}
              aria-label={editing ? "Done editing" : "Edit this draft"}
              title={editing ? "Done editing" : "Edit"}
            >
              <Icon name={editing ? "check" : "edit"} size={12}/>
            </button>
          )}
        </div>
        {editing && !reworking && !streaming ? (
          <textarea
            className="cvb-rw-input cvb-rw-diff-edit"
            value={proposed}
            onChange={e => onProposedChange(e.target.value)}
            rows={3}
            autoFocus
          />
        ) : (
          <div className="cvb-rw-diff-new">
            {proposed}
            {streaming && <span className="cvb-rw-caret" aria-hidden>▍</span>}
          </div>
        )}
        {rationale && <div className="cvb-rw-rationale">{rationale}</div>}
        {citations.length > 0 && (
          <div className="cvb-rw-citation" title="Grounded in the Myro CV Playbook">
            <Icon name="sparkle" size={11}/> Grounded in {citations.join(", ")}
          </div>
        )}

        <div className="cvb-rw-refine">
          <label className="cvb-rw-refine-q" htmlFor="rw-refine">Not quite? Tell Myro what it missed — it&apos;ll build on this version.</label>
          <div className="cvb-rw-refine-row">
            <input
              id="rw-refine"
              className="cvb-rw-input"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. it was cross-border, ₹2Cr budget, I owned the strategy"
              disabled={busy}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submitRefine() } }}
            />
            <Button variant="ghost" size="sm" disabled={busy || !note.trim()} onClick={submitRefine}>
              <Icon name="sparkle" size={12}/> Refine
            </Button>
          </div>
          {errMsg && <div className="cvb-rw-refine-err" role="alert">{errMsg}</div>}
        </div>

        <div className="cvb-rw-actions">
          <Button variant="dismiss" size="sm" onClick={onDiscard} disabled={busy}>Discard</Button>
          <Button size="sm" disabled={busy || !proposed.trim()} onClick={onAccept}>
            <Icon name="check" size={12}/> {applying ? "Saving…" : "Accept"}
          </Button>
        </div>
      </div>
    )
  }
  return null
}

// ── Batch checkpoint: keep going through more gaps, or wrap up here ───────────

function Checkpoint({ resolved, remaining, onContinue, onWrap }: {
  resolved: number; remaining: number; onContinue: () => void; onWrap: () => void
}) {
  return (
    <div className="cvb-gs-checkpoint">
      <div className="cvb-gs-checkpoint-h">
        <Icon name="check" size={14} stroke={3}/>
        {resolved > 0
          ? `Surfaced ${resolved} skill${resolved === 1 ? "" : "s"} so far.`
          : "Paused here."}
      </div>
      <p className="cvb-gs-checkpoint-lede">
        {remaining} more {remaining === 1 ? "gap is" : "gaps are"} ready when you are.
        Keep going, or wrap up and review what you&apos;ve surfaced.
      </p>
      <div className="cvb-gs-actions">
        <Button variant="ghost" size="sm" onClick={onWrap}>Wrap up</Button>
        <Button size="sm" onClick={onContinue}>
          <Icon name="sparkle" size={12}/> Keep going · {Math.min(SESSION_BATCH, remaining)} more
        </Button>
      </div>
    </div>
  )
}

// ── Flywheel upgrade: claim a practice-proven level onto its host bullet ──────

function UpgradeRow({ token, upgrade, onApplied }: {
  token: string; upgrade: UpgradeOffer; onApplied: () => void
}) {
  const host = upgrade.host
  const meta = (
    <>L{upgrade.from_level} → <strong>L{upgrade.to_level}</strong> proven</>
  )

  // No CV evidence to surface onto yet — the proof lives in practice. Route there.
  if (!host) {
    return (
      <Link href={forgeHref(upgrade.skill)} target="_blank" rel="noopener noreferrer" className="cvb-gs-row proven">
        <span className="cvb-gs-row-name">{upgrade.display_name}</span>
        <span className="cvb-gs-row-meta">{meta}</span>
      </Link>
    )
  }

  return (
    <ClaimableUpgrade token={token} upgrade={upgrade} host={host} meta={meta} onApplied={onApplied} />
  )
}

function ClaimableUpgrade({ token, upgrade, host, meta, onApplied }: {
  token: string
  upgrade: UpgradeOffer
  host: NonNullable<UpgradeOffer["host"]>
  meta: React.ReactNode
  onApplied: () => void
}) {
  const { phase, proposed, setProposed, rationale, citations, version, reworking, streaming, applying, propose, refine, accept, reset, errMsg } =
    useRewrite(token, host.bullet_text, [upgrade.display_name], host)

  if (phase === "intro") {
    return (
      <div className="cvb-gs-row proven">
        <span className="cvb-gs-row-name">{upgrade.display_name}</span>
        <span className="cvb-gs-row-meta">{meta}</span>
        <Button size="sm" className="cvb-gs-claim" onClick={() => void propose()}>
          <Icon name="sparkle" size={12}/> Claim on CV
        </Button>
      </div>
    )
  }

  // Once claiming, the row opens the same propose → diff → accept flow as a card.
  return (
    <div className="cvb-gs-row proven claiming">
      <div className="cvb-gs-claim-head">
        <span className="cvb-gs-row-name">{upgrade.display_name}</span>
        <span className="cvb-gs-row-meta">{meta}</span>
      </div>
      <RewriteBody
        phase={phase} proposed={proposed} onProposedChange={setProposed} rationale={rationale} citations={citations}
        version={version} reworking={reworking} streaming={streaming} applying={applying} errMsg={errMsg} before={host.bullet_text}
        onAccept={() => void accept(onApplied)} onDiscard={reset} onRetry={() => void propose()}
        onRefine={note => void refine(note)}
      />
    </div>
  )
}

// ── Practice row: save the skill to your Forge queue, or open it now ─────────

function PracticeRow({ skill, saved, busy, onToggle }: {
  skill: { skill: string; display_name: string; is_primary: boolean; reason: "absent" | "shallow" }
  saved: boolean
  busy: boolean
  onToggle: () => void
}) {
  return (
    <div className="cvb-gs-row build">
      <span className="cvb-gs-row-name">{skill.display_name}</span>
      <span className="cvb-gs-row-meta">
        {skill.is_primary && skill.reason === "absent" && <span className="cvb-gs-primary-tag">primary requirement</span>}
        <button
          type="button"
          className={`cvb-gs-save${saved ? " on" : ""}`}
          onClick={onToggle}
          disabled={busy}
          aria-pressed={saved}
          title={saved ? "Saved to your practice queue" : "Save for practice"}
        >
          <Icon name={saved ? "check" : "save"} size={12}/> {saved ? "Saved" : "Save"}
        </button>
        <Link href={forgeHref(skill.skill)} target="_blank" rel="noopener noreferrer" className="cvb-gs-practice">
          Practice ↗
        </Link>
      </span>
    </div>
  )
}

// ── Closing panel: build in practice + claim what you've proven ──────────────

function ClosingPanel({ token, resolved, startScore, score, practiceSkills, upgrades, onApplied, onClose }: {
  token: string
  resolved: number
  startScore: number
  score: number
  practiceSkills: { skill: string; display_name: string; is_primary: boolean; reason: "absent" | "shallow" }[]
  upgrades: GapPlanResponse["upgrade_offers"]
  onApplied: () => void
  onClose: () => void
}) {
  // Hydrate the save pips from the user's existing Forge queue so a skill saved
  // in a past session shows "Saved", not "Save". Toggles stay optimistic; the
  // POST is an idempotent upsert and DELETE is safe on a missing row, so a
  // failed call just rolls its pip back.
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set())
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    void usersApi.practiceSaves(token)
      .then(res => { if (alive) setSavedKeys(new Set(res.skills.map(s => s.skill_key))) })
      .catch(() => {})
    return () => { alive = false }
  }, [token])

  const withKey = (set: Set<string>, key: string, on: boolean) => {
    const next = new Set(set)
    if (on) next.add(key); else next.delete(key)
    return next
  }

  async function toggleSave(s: { skill: string; display_name: string }) {
    if (busyKeys.has(s.skill)) return
    const next = !savedKeys.has(s.skill)
    setSavedKeys(prev => withKey(prev, s.skill, next))
    setBusyKeys(prev => withKey(prev, s.skill, true))
    try {
      if (next) {
        await usersApi.savePracticeSkill(token, {
          skill_key: s.skill, display_name: s.display_name, source: "gap_session",
        })
      } else {
        await usersApi.unsavePracticeSkill(token, s.skill)
      }
    } catch {
      setSavedKeys(prev => withKey(prev, s.skill, !next))
    } finally {
      setBusyKeys(prev => withKey(prev, s.skill, false))
    }
  }

  return (
    <div className="cvb-gs-closing">
      {score > startScore && (
        <div className="cvb-gs-climb" role="status">
          <span className="cvb-gs-climb-from">{startScore}%</span>
          <span className="cvb-gs-climb-arrow" aria-hidden>→</span>
          <span className="cvb-gs-climb-to tabnum">{score}<span>%</span></span>
          <span className="cvb-gs-climb-cap">JD match, this session</span>
        </div>
      )}

      {resolved > 0 && (
        <div className="cvb-gs-tally" role="status">
          <Icon name="check" size={14} stroke={3}/> Surfaced {resolved} skill{resolved === 1 ? "" : "s"} on your CV
        </div>
      )}

      {upgrades.length > 0 && (
        <section className="cvb-gs-section">
          <div className="cvb-gs-section-h proven">You&apos;ve already proven these</div>
          {upgrades.map(u => (
            <UpgradeRow key={u.skill} token={token} upgrade={u} onApplied={onApplied} />
          ))}
        </section>
      )}

      {practiceSkills.length > 0 && (
        <section className="cvb-gs-section">
          <div className="cvb-gs-section-h build">Build these in practice</div>
          {practiceSkills.map(s => (
            <PracticeRow
              key={s.skill}
              skill={s}
              saved={savedKeys.has(s.skill)}
              busy={busyKeys.has(s.skill)}
              onToggle={() => void toggleSave(s)}
            />
          ))}
        </section>
      )}

      {resolved === 0 && upgrades.length === 0 && practiceSkills.length === 0 && (
        <div className="cvb-gs-tally"><Icon name="check" size={14} stroke={3}/> No gaps to close — your CV already speaks this role.</div>
      )}

      <div className="cvb-gs-foot">
        <Button size="sm" onClick={onClose}>Done</Button>
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
