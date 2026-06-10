/* Upskilling container — Surface A state machine (home → quiz → results),
   wired to api.upskilling.*. The server holds the answer key and the grading;
   this view only serves the set, collects answers, and renders the verdict the
   server returns. Tokens/levels are awarded server-side (PRD §4.3, DEC-1a). */

"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { upskilling, type DemandBand, type ReadinessRow, type StartGapResponse, type UpskillingSkill } from "@/lib/api"
import type { PracticeSkills } from "@/lib/practice-skills"
import { dataKeys } from "@/lib/domain-data"
import { useParticleMoment } from "@/components/particle"
import { GapEntryCard, NextSetHero, SkillList } from "./upskilling-home"
import { GapReadiness } from "./gap-readiness"
import { QuizRunner } from "./quiz-runner"
import { Results } from "./results"
import { getBestSeconds, recordBestSeconds } from "./quiz-best"
import { PROFICIENCY } from "./proficiency"
import type { LadderSkill, QuizQuestion, ResultModel } from "./types"

const norm = (s: string): string => s.trim().toLowerCase()

interface DemandInfo { demand: DemandBand; jobCount: number }

/** Build a name/key → demand lookup from the existing practice-skill signal. */
function demandIndex(practice: PracticeSkills): { byKey: Map<string, DemandInfo>; byName: Map<string, DemandInfo> } {
  const byKey = new Map<string, DemandInfo>()
  const byName = new Map<string, DemandInfo>()
  practice.owned.forEach((o) => {
    const info: DemandInfo = { demand: o.demandBand, jobCount: o.jobCount }
    if (o.item.key) byKey.set(o.item.key, info)
    byName.set(norm(o.item.display_name), info)
  })
  practice.gaps.forEach((g) => {
    byName.set(norm(g.skill_name), { demand: g.demandBand, jobCount: g.jobCount })
  })
  return { byKey, byName }
}

function mergeSkills(backend: UpskillingSkill[], practice: PracticeSkills): LadderSkill[] {
  const { byKey, byName } = demandIndex(practice)
  return backend.map((s) => {
    const info = byKey.get(s.skill_key) ?? byName.get(norm(s.display_name))
    return {
      skillId: s.skill_id,
      key: s.skill_key || String(s.skill_id),
      name: s.display_name,
      clearedLevel: s.cleared_level,
      assessedLevel: s.assessed_level,
      nextLevel: s.next_level,
      onCV: s.on_cv,
      demand: info?.demand ?? "none",
      jobCount: info?.jobCount ?? 0,
      maxBankLevel: s.max_bank_level,
      locked: s.locked,
    }
  })
}

function pickHero(skills: LadderSkill[]): LadderSkill | null {
  const startable = skills.filter((s) => s.clearedLevel < 5 && s.maxBankLevel >= Math.min(s.clearedLevel + 1, 5))
  const ranked = [...startable].sort((a, b) => {
    const ai = a.clearedLevel > 0 ? 1 : 0
    const bi = b.clearedLevel > 0 ? 1 : 0
    if (ai !== bi) return bi - ai
    const rank: Record<DemandBand, number> = { very_high: 4, high: 3, moderate: 2, low: 1, none: 0 }
    return (rank[b.demand] - rank[a.demand]) || (b.jobCount - a.jobCount)
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
  practiceSkills,
  gapJob,
  gapJobId,
  onClearGap,
  onToast,
}: {
  token: string
  practiceSkills: PracticeSkills
  /** Top target job — surfaces the home gap-entry card when present. */
  gapJob?: { jobId: string; title: string; company: string | null } | null
  /** Deep-link from Tracker / Market ("?gap=<jobId>") — auto-starts the flow. */
  gapJobId?: string | null
  onClearGap?: () => void
  onToast?: (msg: string) => void
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

  const { data: backendSkills, isLoading } = useQuery({
    queryKey: UPSKILLING_SKILLS_KEY(token),
    queryFn: () => upskilling.skills(token),
    staleTime: 60 * 1000,
  })

  const skills = useMemo(
    () => mergeSkills(backendSkills ?? [], practiceSkills),
    [backendSkills, practiceSkills],
  )
  const heroSkill = useMemo(() => pickHero(skills), [skills])

  const startSet = useCallback(async (skill: LadderSkill, level: number) => {
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
      })
      setScreen("results")

      if (res.tokens_awarded > 0) {
        // Celebration on a PAID clear only (gating handled by the provider).
        window.setTimeout(() => fireMoment({ intensity: 1.5 }), 240)
      }
      if (res.passed) {
        // DEC-1a: a clear bumps the headline level + token balance server-side.
        queryClient.invalidateQueries({ queryKey: UPSKILLING_SKILLS_KEY(token) })
        queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
        queryClient.invalidateQueries({ queryKey: dataKeys.scores() })
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
        flashToast("No calibration questions are ready for this job yet.")
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
      queryClient.invalidateQueries({ queryKey: dataKeys.userSkills() })
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
    if (s) startSet(s, s.nextLevel)
    else flashToast("Start this skill from the ladder below.")
  }, [skills, startSet, flashToast])

  if (isLoading) {
    return <div className="up-root"><div className="up-empty">Loading your upskilling ladder…</div></div>
  }

  return (
    <div className="up-root">
      {screen === "home" && (
        <div className="up-page up-enter">
          {heroSkill ? (
            <>
              <NextSetHero skill={heroSkill} onStart={startSet} />
              {gapJob && (
                <GapEntryCard
                  job={{ title: gapJob.title, company: gapJob.company ?? "your target job" }}
                  onAssess={() => startGap(gapJob.jobId)}
                />
              )}
              <SkillList skills={skills} activeKey={quiz?.skill.key ?? null} onStart={startSet} />
              <div className="up-foot-note">
                Tokens are earned only on a clear, only the first time per level. 10/10 = +50 · 9/10 = +30 · 8/10 = +20 · below 8 = 0.
              </div>
            </>
          ) : (
            <div className="up-card up-empty-card">
              <h3>Your upskilling ladder is on the way</h3>
              <p>Question banks for your skills are still filling. Check back soon — clearing a level set earns tokens and raises your real skill level.</p>
            </div>
          )}
        </div>
      )}

      {screen === "gap-quiz" && gap && (
        <QuizRunner
          title="Readiness calibration"
          subtitle={`${gap.jobTitle} · diagnostic · earns no tokens`}
          questions={gap.questions}
          onSubmit={submitGap}
          onExit={goHome}
          submitLabel="See my readiness"
        />
      )}

      {screen === "gap-result" && gapResult && (
        <GapReadiness
          job={{ title: gapResult.jobTitle, company: gapResult.company }}
          rows={gapResult.readiness}
          overallPct={gapResult.overallPct}
          onPractice={practiceFromGap}
          onBack={goHome}
        />
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
        <Results
          result={result}
          onBackToSkills={goHome}
          onPracticeAgain={() => { const s = skillByName(result.skillName); if (s) startSet(s, result.level) }}
          onNextLevel={() => { const s = skillByName(result.skillName); if (s) startSet(s, result.nextLevel) }}
        />
      )}

      {toast && <div className="up-toast" role="status">{toast}</div>}
    </div>
  )
}
