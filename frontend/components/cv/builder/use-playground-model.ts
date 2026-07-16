/**
 * usePlaygroundModel — the CV Playground v2 read model.
 *
 * One hook that turns (job, skill gap, gap plan, JD coverage, live CV, hidden
 * set) into everything the v2 surface renders: evaluated keyword targets, the
 * ONE Match score (70% requirement coverage + 30% keyword landing − content
 * penalty — see match-score.ts), the deterministic +N per fix, the unified
 * fix list, the levelled skill rows, and the sheet metadata. Pure reads —
 * mutations stay in the view.
 */
"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import type {
  CVStructured, GapPlanResponse, JDCoverageResponse, JobPathResponse, SkillGapResponse, UserProfile,
} from "@/lib/api"
import { jobs as jobsApi, cv as cvApi } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import { dataKeys } from "@/lib/domain-data"
import { IDEAL_CV_SPEC, estimateLines, pageFillFromLines, type PageFill } from "@/lib/cv/page-fill"
import { contentPenalty, runContentChecks } from "./content-checks"
import { buildV2Fixes, type V2Fix } from "./fix-model"
import { keywordLayerSpan, matchScore } from "./match-score"
import { buildSkillRows } from "./skills-rail"
import { evaluateTargets, resolvePlaygroundCompany, targetsFromSkillGap, type KeywordTarget } from "./keyword-utils"

export interface PlaygroundModelOpts {
  /** "master" = the Main-CV surface: no job, no JD gap. Score is the CV-intrinsic
   *  Myro Score (passed as masterScore), fixes are recruiter-check content only,
   *  and no per-job point-gain is claimed. Default "job". */
  mode?: "job" | "master"
  /** Myro Score (0–100) — the header meter in master mode. Ignored for jobs. */
  masterScore?: number
}

export function usePlaygroundModel(
  token: string,
  jobId: string,
  cv: CVStructured,
  profile: UserProfile | null,
  hiddenItems: Set<string>,
  opts?: PlaygroundModelOpts,
) {
  // Master mode has no job → the four job reads never fire (a blank jobId would
  // otherwise 404). Content-quality fixes work from the CV alone.
  const isMaster = opts?.mode === "master"
  const jobPathQuery = useQuery({
    queryKey: dataKeys.jobPath(jobId),
    queryFn: () => jobsApi.path(token, jobId),
    staleTime: 5 * 60 * 1000,
    enabled: !isMaster,
  })
  const skillGapQuery = useQuery({
    queryKey: dataKeys.skillGap(jobId),
    queryFn: () => jobsApi.skillGap(token, jobId),
    staleTime: 5 * 60 * 1000,
    enabled: !isMaster,
  })
  const applicationsQuery = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token),
    staleTime: 60_000,
    enabled: !isMaster,
  })
  const gapPlanQuery = useQuery<GapPlanResponse>({
    queryKey: ["cv-gap-plan", jobId],
    queryFn: () => cvApi.gapPlan(token, jobId),
    staleTime: 60_000,
    enabled: !isMaster,
  })
  // Lane C — the JD's real requirements classified against the user's career
  // stories (covered / partial / missing). The semantic 70% of the Match score;
  // also powers the Job-fit rail and the Mentor walk (the view reads this same
  // query object).
  const coverageQuery = useQuery<JDCoverageResponse>({
    queryKey: ["jd-coverage", jobId],
    queryFn: () => cvApi.career.jdCoverage(token, jobId),
    staleTime: 5 * 60 * 1000,
    enabled: !isMaster,
  })

  const job: Partial<JobPathResponse> = jobPathQuery.data ?? {}
  const gap: Partial<SkillGapResponse> = skillGapQuery.data ?? {}
  const application = applicationsQuery.data?.find(a => a.job_id === jobId) ?? null
  const company = resolvePlaygroundCompany(job.company, gap.company)
  const jobTitle = job.job_title ?? gap.job_title ?? "Untitled role"
  const jdText = (application?.job_description ?? "").trim()
  const roles = useMemo(
    () => cv.experience.map((e, i) => ({ index: i, label: `${e.role} · ${e.company}` })),
    [cv.experience],
  )

  const allTargets: KeywordTarget[] = useMemo(() => targetsFromSkillGap(gap.skills ?? []), [gap.skills])

  const visibleText = useMemo(() => {
    const parts: string[] = []
    if (cv.summary && !hiddenItems.has(itemId("summary", 0, cv.summary))) parts.push(cv.summary)
    cv.experience.forEach((e, ei) => e.bullets.forEach((b, bi) => {
      if (!hiddenItems.has(itemId("exp_bullet", ei * 100 + bi, b))) parts.push(b)
    }))
    cv.projects.forEach((p, pi) => p.bullets.forEach((b, bi) => {
      if (!hiddenItems.has(itemId("proj_bullet", pi * 100 + bi, b))) parts.push(b)
    }))
    if (cv.skills_line && !hiddenItems.has(itemId("skills_line", 0, cv.skills_line))) parts.push(cv.skills_line)
    return parts.join(" ")
  }, [hiddenItems, cv])

  // Server semantic credit is the floor; verbatim text hits add on top (the
  // live +N mechanic for missing keywords). See evaluateTargets.
  const evaluatedTargets = useMemo<KeywordTarget[]>(
    () => evaluateTargets(allTargets, visibleText),
    [allTargets, visibleText],
  )

  // Content-quality penalty (#34 S3): open recruiter-check findings subtract real
  // points from Ready, and each fix returns its exact points on a real text change.
  // Hidden lines are excluded — Ready's keyword side already reads visible text
  // only, so a deselected bullet can neither cost points nor earn them back.
  const contentPenaltyPts = useMemo(
    () => contentPenalty(runContentChecks(cv, hiddenItems)),
    [cv, hiddenItems],
  )

  // Master: the header shows the Myro Score verbatim (CV-intrinsic, radar-based).
  // A bullet rewrite does NOT move the Myro Score, so the content-quality penalty
  // never subtracts from it — honesty (job Match is a separate, penalty-bearing
  // number). Job: the keyword-landing percent (server skill credit + live text
  // hits) — the 30% layer of the Match score, and the whole score until the
  // requirement coverage lands.
  const baseScore = isMaster ? Math.round(opts?.masterScore ?? 0) : (job.readiness_pct ?? 0)
  const keywordPct = useMemo(() => {
    if (evaluatedTargets.length === 0) return baseScore
    const total = evaluatedTargets.reduce((s, t) => s + (t.weight ?? 1), 0)
    const got = evaluatedTargets.filter(t => t.matched).reduce((s, t) => s + (t.weight ?? 1), 0)
    return total === 0 ? 0 : Math.round((got / total) * 100)
  }, [evaluatedTargets, baseScore])

  // ONE number (see match-score.ts): 70% requirement coverage (semantic) +
  // 30% keyword landing − content penalty. Keyword-only until coverage lands.
  const coverageCounts = useMemo(() => {
    const c = coverageQuery.data
    return c && c.requirements.length > 0
      ? { covered: c.covered, weak: c.weak, gap: c.gap }
      : null
  }, [coverageQuery.data])
  const hasSemantic = !isMaster && coverageCounts != null
  const ready = useMemo(() => {
    if (isMaster) return baseScore
    return matchScore(coverageCounts, keywordPct, contentPenaltyPts)
  }, [isMaster, baseScore, coverageCounts, keywordPct, contentPenaltyPts])

  const totalWeight = useMemo(
    () => Math.max(1, evaluatedTargets.reduce((s, t) => s + (t.weight ?? 1), 0)),
    [evaluatedTargets],
  )
  // Deterministic Match gain for a gap's keyword(s): its share of the keyword
  // LAYER (30 pts beside coverage, 100 standalone) — the same math the score
  // uses, so "+N" promised is +N delivered.
  const pointsFor = useMemo(() => (keywords: string[]): number => {
    const span = keywordLayerSpan(hasSemantic)
    const set = new Set(keywords.map(k => k.toLowerCase()))
    let w = 0
    evaluatedTargets.forEach(t => { if (set.has(t.kw.toLowerCase())) w += (t.weight ?? 1) })
    if (w === 0) w = 1
    return Math.max(1, Math.round((w / totalWeight) * span))
  }, [evaluatedTargets, totalWeight, hasSemantic])

  // The unified fix list. JD-tier fixes stay open until their keyword actually
  // lands on the CV (honest — an applied rewrite that missed the word keeps its
  // card); recruiter-check fixes vanish when the text stops triggering them.
  const matchedKw = useMemo(
    () => new Set(evaluatedTargets.filter(t => t.matched).map(t => t.kw.toLowerCase())),
    [evaluatedTargets],
  )
  const openFixes: V2Fix[] = useMemo(() => {
    const all = buildV2Fixes(cv, gapPlanQuery.data ?? null, pointsFor, hiddenItems)
    return all.filter(f =>
      f.tier === 1 || f.keywords.length === 0 || !f.keywords.every(k => matchedKw.has(k.toLowerCase())))
  }, [cv, gapPlanQuery.data, pointsFor, matchedKw, hiddenItems])

  const skillRows = useMemo(
    () => buildSkillRows(gap.skills ?? [], gapPlanQuery.data ?? null, evaluatedTargets, openFixes, cv, hiddenItems),
    [gap.skills, gapPlanQuery.data, evaluatedTargets, openFixes, cv, hiddenItems],
  )
  const coveredCount = skillRows.filter(r => r.status === "covered").length

  const visibleCount = useMemo(() => {
    let n = 0
    cv.experience.forEach((e, ei) => e.bullets.forEach((b, bi) => {
      if (!hiddenItems.has(itemId("exp_bullet", ei * 100 + bi, b))) n += 1
    }))
    cv.projects.forEach((p, pi) => p.bullets.forEach((b, bi) => {
      if (!hiddenItems.has(itemId("proj_bullet", pi * 100 + bi, b))) n += 1
    }))
    return n
  }, [hiddenItems, cv])
  const wordCount = useMemo(
    () => visibleText.trim() ? visibleText.trim().split(/\s+/).length : 0,
    [visibleText],
  )

  const pageFill: PageFill = useMemo(() => {
    const cpl = IDEAL_CV_SPEC.charsPerLine
    let lines = 3
    if (cv.summary && !hiddenItems.has(itemId("summary", 0, cv.summary))) lines += 1 + estimateLines(cv.summary, cpl)
    let expVisible = false
    cv.experience.forEach((e, ei) => {
      const kept = e.bullets.filter((b, bi) => !hiddenItems.has(itemId("exp_bullet", ei * 100 + bi, b)))
      if (kept.length) { expVisible = true; lines += 1 + kept.reduce((s, b) => s + estimateLines(b, cpl), 0) }
    })
    if (expVisible) lines += 1
    if (cv.skills_line && !hiddenItems.has(itemId("skills_line", 0, cv.skills_line))) lines += 1 + estimateLines(cv.skills_line, cpl)
    return pageFillFromLines(lines)
  }, [cv, hiddenItems])

  const sheetContact = useMemo(() => ({
    name: cv.contact?.name?.trim() || profile?.full_name?.trim() || "Your name",
    title: cv.contact?.title?.trim() || cv.experience[0]?.role || "",
    meta: [cv.contact?.email || profile?.email, cv.contact?.linkedin || profile?.linkedin_url]
      .filter(Boolean).join(" · "),
  }), [cv, profile])

  return {
    job, gap, application, company, jobTitle, jdText, roles,
    allTargets, visibleText, evaluatedTargets,
    baseScore, ready, hasSemantic, coverageQuery, pointsFor,
    openFixes, skillRows, coveredCount,
    visibleCount, wordCount, pageFill, sheetContact,
  }
}
