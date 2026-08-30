/* Upskilling container — Surface A state machine (home → quiz → results),
   wired to api.upskilling.*. The server holds the answer key and the grading;
   this view only serves the set, collects answers, and renders the verdict the
   server returns. Tokens/levels are awarded server-side (PRD §4.3, DEC-1a). */

"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { upskilling, users, type ReadinessRow, type SkillUpvote, type StartGapResponse, type UpskillingSkill } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { dataKeys } from "@/lib/domain-data"
import { addCertificateHref } from "@/lib/career-skill-path"
import { useParticleMoment } from "@/components/particle"
import type { SkillIntelStats } from "@/lib/skill-domains"
import { ForgeContextBar } from "./forge-bar"
import { MoveHero } from "./move-hero"
import { ClimbList } from "./climb-list"
import { GapReadiness } from "./gap-readiness"
import { QuizRunner } from "./quiz-runner"
import { Results } from "./results"
import { getBestSeconds, recordBestSeconds } from "./quiz-best"
import { PROFICIENCY } from "./proficiency"
import type { LadderSkill, QuizQuestion, ResultModel } from "./types"

const norm = (s: string): string => s.trim().toLowerCase()

function upvoteIndex(upvotes: SkillUpvote[]): Map<string, number> {
  const map = new Map<string, number>()
  upvotes.forEach((u) => {
    map.set(norm(u.skill_key), u.count)
    if (u.display_name) map.set(norm(u.display_name), u.count)
  })
  return map
}

function toLadder(backend: UpskillingSkill[], upvotes: Map<string, number>): LadderSkill[] {
  return backend.map((s) => ({
    skillId: s.skill_id,
    key: s.skill_key || String(s.skill_id),
    name: s.display_name,
    clearedLevel: s.cleared_level,
    assessedLevel: s.assessed_level,
    nextLevel: s.next_level,
    onCV: s.on_cv,
    upvotes: upvotes.get(norm(s.skill_key)) ?? upvotes.get(norm(s.display_name)) ?? 0,
    maxBankLevel: s.max_bank_level,
    locked: s.locked,
    hasCvEvidence: s.on_cv,
  }))
}

function pickHero(skills: LadderSkill[]): LadderSkill | null {
  const startable = skills.filter((s) => s.clearedLevel < 5 && s.maxBankLevel >= Math.min(s.clearedLevel + 1, 5))
  const ranked = [...startable].sort((a, b) => {
    if (a.upvotes !== b.upvotes) return b.upvotes - a.upvotes
    const ai = a.clearedLevel > 0 ? 1 : 0
    const bi = b.clearedLevel > 0 ? 1 : 0
    if (ai !== bi) return bi - ai
    return a.name.localeCompare(b.name)
  })
  return ranked[0] ?? skills[0] ?? null
}

const UPSKILLING_SKILLS_KEY = (token: string) => ["upskilling-skills", token] as const

type QuizState = {
  skill: LadderSkill
  level: number
  setId: string
  idempotencyKey: string
  questions: QuizQuestion[]
  originJobId: string | null
}

type Screen = "home" | "quiz" | "results" | "gap-quiz" | "gap-result"

type GapState = {
  assessmentId: string
  jobId: string
  jobTitle: string
  company: string | null
  questions: QuizQuestion[]
}

type GapResult = {
  jobTitle: string
  company: string | null
  readiness: ReadinessRow[]
  overallPct: number
}

export function UpskillingView({
  token,
  gapJobId,
  focusSkill,
  originJobId,
  onClearGap,
  onToast,
  onNavigate,
  onBack,
  totalScore,
  band,
  topPercent,
  stats,
  ninjaName,
  roleTitles,
}: {
  token: string
  /** Deep-link from Tracker / Market ("?gap=<jobId>") — auto-starts the flow. */
  gapJobId?: string | null
  /** Direct practice link and the job it came from, when any. */
  focusSkill?: string | null
  originJobId?: string | null
  onClearGap?: () => void
  onToast?: (msg: string) => void
  onNavigate: (href: string) => void
  /** The Forge context bar's "‹ Back" affordance. */
  onBack: () => void
  totalScore: number | null
  band?: string | null
  topPercent?: number | null
  stats: SkillIntelStats | null
  ninjaName?: string | null
  /** Target role titles, primary first — the collapsed bar pill. */
  roleTitles: string[]
}): JSX.Element {
  const queryClient = useQueryClient()
  const fireMoment = useParticleMoment()

  const [screen, setScreen] = useState<Screen>("home")
  const [quiz, setQuiz] = useState<QuizState | null>(null)
  const [result, setResult] = useState<ResultModel | null>(null)
  const [gap, setGap] = useState<GapState | null>(null)
  const [gapResult, setGapResult] = useState<GapResult | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const flashToast = useCallback((msg: string) => {
    onToast?.(msg)
    setToast(msg)
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2600)
  }, [onToast])

  const {
    data: backendSkills,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: UPSKILLING_SKILLS_KEY(token),
    queryFn: () => upskilling.skills(token),
    staleTime: 60 * 1000,
  })

  const { data: upvotesData } = useQuery({
    queryKey: dataKeys.skillUpvotes(),
    queryFn: () => users.skillUpvotes(token),
    staleTime: 60 * 1000,
  })

  const skills = useMemo(
    () => toLadder(backendSkills ?? [], upvoteIndex(upvotesData?.skills ?? [])),
    [backendSkills, upvotesData],
  )
  const heroSkill = useMemo(() => pickHero(skills), [skills])

  const startSet = useCallback(async (skill: LadderSkill, level: number, sourceJobId: string | null = null) => {
    if (starting) return
    setStarting(true)
    try {
      const res = await upskilling.startSet(token, skill.skillId, level)
      setQuiz({
        skill,
        level,
        setId: res.set_id,
        idempotencyKey: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${res.set_id}-${Date.now()}`,
        questions: res.questions.map((q) => ({ id: q.id, q: q.question_text, options: q.options })),
        originJobId: sourceJobId,
      })
      setScreen("quiz")
    } catch {
      flashToast(`More L${level} ${skill.name} questions are on the way — the bank is filling.`)
    } finally {
      setStarting(false)
    }
  }, [token, starting, flashToast])

  const submitQuiz = useCallback(async (answers: Array<number | null>, elapsedSeconds: number) => {
    if (!quiz) return
    const payload = quiz.questions.map((qq, i) => ({
      question_id: qq.id,
      selected_index: answers[i] ?? -1,
    }))
    try {
      const res = await upskilling.submitSet(token, quiz.setId, payload, quiz.idempotencyKey)
      const byId = new Map(res.results.map((r) => [r.question_id, r]))
      const items = quiz.questions.map((qq, i) => {
        const r = byId.get(qq.id)
        return {
          q: qq.q,
          options: qq.options,
          correct: r ? r.correct_index : -1,
          selected: answers[i],
          isCorrect: r ? r.is_correct : false,
          expl: r ? r.explanation : "",
          rationales: r?.rationales,
        }
      })
      // Cosmetic speed stat (DEC-S4): record only a passing clear; read prior
      // best BEFORE writing so a slower re-clear can still show the best.
      let prevBestSeconds: number | null = null
      let newBest = false
      if (res.passed) {
        prevBestSeconds = getBestSeconds(quiz.skill.skillId, quiz.level)
        newBest = recordBestSeconds(quiz.skill.skillId, quiz.level, elapsedSeconds)
      }
      setResult({
        skillName: quiz.skill.name,
        level: quiz.level,
        score: res.score,
        max: res.max,
        passed: res.passed,
        firstClear: res.first_clear,
        tokens: res.tokens_awarded,
        items,
        nextLevel: res.next_level_unlocked ?? Math.min(quiz.level + 1, 5),
        maxedOut: quiz.level >= 5,
        elapsedSeconds,
        prevBestSeconds,
        newBest,
        // Only when a live role actually asks for this skill — the backend
        // returns null rather than zeroes so there is nothing to suppress here.
        payoff: res.passed && res.payoff && res.payoff.met_total > 0
          ? { newlyMet: res.payoff.newly_met, metTotal: res.payoff.met_total }
          : null,
        certificate: res.passed ? (res.certificate ?? null) : null,
        cvHref: res.passed && res.certificate?.verification_id
          ? addCertificateHref(res.certificate.verification_id)
          : null,
      })
      setScreen("results")

      if (res.tokens_awarded > 0) {
        // Celebration on a PAID clear only (gating handled by the provider).
        window.setTimeout(() => fireMoment({ intensity: 1.5 }), 240)
      }
      if (res.passed) {
        // A clear records assessed-learning progress + token balance server-side.
        queryClient.invalidateQueries({ queryKey: UPSKILLING_SKILLS_KEY(token) })
        queryClient.invalidateQueries({ queryKey: dataKeys.careerSkillPath() })
      }
    } catch {
      flashToast("Couldn’t grade this set — check your connection and try again.")
    }
  }, [quiz, token, fireMoment, queryClient, flashToast])

  const goHome = useCallback(() => {
    setScreen("home")
    setQuiz(null)
    setResult(null)
    setGap(null)
    setGapResult(null)
    onClearGap?.()
  }, [onClearGap])

  const skillByName = useCallback(
    (name: string) => skills.find((s) => s.name === name) ?? null,
    [skills],
  )

  // ── Surface B — gap calibration ──
  const startGap = useCallback(async (jobId: string) => {
    if (starting) return
    setStarting(true)
    try {
      const res: StartGapResponse = await upskilling.startGap(token, jobId)
      const questions: QuizQuestion[] = res.skills.flatMap((s) =>
        s.calibration_set.map((q) => ({ id: q.id, q: q.question_text, options: q.options })),
      )
      if (questions.length === 0) {
        flashToast(
          res.reason === "no_gaps"
            ? "Your CV already meets this job's required skill levels."
            : "No calibration questions are ready for this job yet.",
        )
        onClearGap?.()
        return
      }
      setGap({
        assessmentId: res.assessment_id,
        jobId: res.job_id,
        jobTitle: res.job_title ?? "this job",
        company: res.company_name,
        questions,
      })
      setScreen("gap-quiz")
    } catch {
      flashToast("Couldn’t start the readiness check — try again in a moment.")
      onClearGap?.()
    } finally {
      setStarting(false)
    }
  }, [token, starting, flashToast, onClearGap])

  const submitGap = useCallback(async (answers: Array<number | null>) => {
    if (!gap) return
    const payload = gap.questions.map((qq, i) => ({
      question_id: qq.id,
      selected_index: answers[i] ?? -1,
    }))
    try {
      const res = await upskilling.submitGap(token, gap.jobId, gap.assessmentId, payload)
      setGapResult({
        jobTitle: gap.jobTitle,
        company: gap.company,
        readiness: res.readiness,
        overallPct: res.overall_readiness_pct,
      })
      setScreen("gap-result")
      // Diagnostic writes assessed levels server-side — refresh the ladder.
      queryClient.invalidateQueries({ queryKey: UPSKILLING_SKILLS_KEY(token) })
    } catch {
      flashToast("Couldn’t score the readiness check — try again in a moment.")
    }
  }, [gap, token, queryClient, flashToast])

  // Deep-link from Tracker / Market: auto-start once per jobId.
  const autoStartedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!gapJobId) { autoStartedRef.current = null; return }
    if (autoStartedRef.current === gapJobId) return
    autoStartedRef.current = gapJobId
    startGap(gapJobId)
  }, [gapJobId, startGap])

  const practiceFromGap = useCallback((row: ReadinessRow) => {
    const s = skills.find((sk) => sk.key === row.skill_key || sk.name === row.skill)
    if (s) startSet(s, s.nextLevel, gap?.jobId ?? null)
    else flashToast("Start this skill from the ladder below.")
  }, [skills, startSet, gap?.jobId, flashToast])

  const autoStartedSkillRef = useRef<string | null>(null)
  useEffect(() => {
    const wanted = focusSkill?.trim()
    if (!wanted) { autoStartedSkillRef.current = null; return }
    const marker = `${norm(wanted)}:${originJobId ?? "generic"}`
    if (autoStartedSkillRef.current === marker || isLoading) return
    const skill = skills.find(item => norm(item.key) === norm(wanted) || norm(item.name) === norm(wanted))
    if (!skill) return
    autoStartedSkillRef.current = marker
    void startSet(skill, skill.nextLevel, originJobId ?? null)
  }, [focusSkill, originJobId, isLoading, skills, startSet])

  if (isLoading) {
    return <div className="up-root"><div className="up-empty">Loading your upskilling ladder…</div></div>
  }

  if (isError) {
    return (
      <div className="up-root">
        <div className="up-card up-empty-card" role="alert">
          <h3>Couldn’t load your upskilling ladder</h3>
          <p>We couldn’t reach your question bank. Your progress is safe.</p>
          <Button onClick={() => void refetch()} disabled={isFetching}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const bar = (
    <ForgeContextBar
      onBack={onBack}
      score={totalScore}
      band={band}
      topPercent={topPercent}
      stats={stats}
      ninjaName={ninjaName}
      roleTitles={roleTitles}
    />
  )

  return (
    <div className="up-root">
      {screen === "home" && (
        <>
          {bar}
          <div className="up-below-bar up-enter">
            {heroSkill ? (
              <>
                <MoveHero skill={heroSkill} primaryRole={roleTitles[0] ?? null} onStart={startSet} />
                <ClimbList skills={skills} onStart={startSet} />
              </>
            ) : (
              <div className="up-card up-empty-card">
                <h3>Your upskilling ladder is on the way</h3>
                <p>Question banks for your skills are still filling. Clearing a level set earns Myro Coins and records your learning progress.</p>
              </div>
            )}
          </div>
        </>
      )}

      {screen === "gap-quiz" && gap && (
        <QuizRunner
          title="Readiness calibration"
          subtitle={`${gap.jobTitle} · diagnostic · earns no Myro Coins`}
          questions={gap.questions}
          onSubmit={submitGap}
          onExit={goHome}
          submitLabel="See my readiness"
        />
      )}

      {screen === "gap-result" && gapResult && (
        <>
          {bar}
          <div className="up-below-bar up-narrow up-enter">
            <GapReadiness
              job={{ title: gapResult.jobTitle, company: gapResult.company }}
              rows={gapResult.readiness}
              overallPct={gapResult.overallPct}
              onPractice={practiceFromGap}
              onBack={goHome}
            />
          </div>
        </>
      )}

      {screen === "quiz" && quiz && (
        <QuizRunner
          title={`${quiz.skill.name} · Level ${quiz.level}`}
          subtitle={`${PROFICIENCY[quiz.level]} · clear 8/10 to earn`}
          questions={quiz.questions}
          onSubmit={submitQuiz}
          onExit={goHome}
        />
      )}

      {screen === "results" && result && (
        <>
          {bar}
          <div className="up-below-bar up-narrow up-enter">
            <Results
              result={result}
              onBackToSkills={goHome}
              onPracticeAgain={() => { const s = skillByName(result.skillName); if (s) startSet(s, result.level, quiz?.originJobId ?? null) }}
              onNextLevel={() => { const s = skillByName(result.skillName); if (s) startSet(s, result.nextLevel, quiz?.originJobId ?? null) }}
              onImproveCv={onNavigate}
            />
          </div>
        </>
      )}

      {toast && <div className="up-toast" role="status">{toast}</div>}
    </div>
  )
}
