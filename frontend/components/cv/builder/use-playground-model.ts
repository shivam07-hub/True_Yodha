/**
 * usePlaygroundModel — the CV Playground v2 read model.
 *
 * One hook that turns (job, skill gap, gap plan, live CV, hidden set) into
 * everything the v2 surface renders: evaluated keyword targets, the honest
 * Ready score (keyword weights minus the content-quality penalty), the
 * deterministic +N per fix, the unified fix list, the levelled skill rows,
 * and the sheet metadata. Pure reads — mutations stay in the view.
 */
"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import type {
  CVStructured, GapPlanResponse, JobPathResponse, SkillGapResponse, UserProfile,
} from "@/lib/api"
import { jobs as jobsApi, cv as cvApi } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import { dataKeys } from "@/lib/domain-data"
import { IDEAL_CV_SPEC, estimateLines, pageFillFromLines, type PageFill } from "@/lib/cv/page-fill"
import { contentPenalty, runContentChecks } from "./content-checks"
import { buildV2Fixes, type V2Fix } from "./fix-model"
import { buildSkillRows } from "./skills-rail"
import { resolvePlaygroundCompany, targetsFromSkillGap, type KeywordTarget } from "./keyword-utils"

export function usePlaygroundModel(
  token: string,
  jobId: string,
  cv: CVStructured,
  profile: UserProfile | null,
  hiddenItems: Set<string>,
) {
  const jobPathQuery = useQuery({
    queryKey: dataKeys.jobPath(jobId),
    queryFn: () => jobsApi.path(token, jobId),
    staleTime: 5 * 60 * 1000,
  })
  const skillGapQuery = useQuery({
    queryKey: dataKeys.skillGap(jobId),
    queryFn: () => jobsApi.skillGap(token, jobId),
    staleTime: 5 * 60 * 1000,
  })
  const applicationsQuery = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token),
    staleTime: 60_000,
  })
  const gapPlanQuery = useQuery<GapPlanResponse>({
    queryKey: ["cv-gap-plan", jobId],
    queryFn: () => cvApi.gapPlan(token, jobId),
    staleTime: 60_000,
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

  const evaluatedTargets = useMemo<KeywordTarget[]>(() => {
    const lower = visibleText.toLowerCase()
    return allTargets.map(t => ({ ...t, matched: lower.includes(t.kw.toLowerCase()) }))
  }, [allTargets, visibleText])

  // Content-quality penalty (#34 S3): open recruiter-check findings subtract real
  // points from Ready, and each fix returns its exact points on a real text change.
  const contentPenaltyPts = useMemo(() => contentPenalty(runContentChecks(cv)), [cv])

  const baseScore = job.readiness_pct ?? 0
  const ready = useMemo(() => {
    const match = evaluatedTargets.length === 0
      ? baseScore
      : (() => {
          const total = evaluatedTargets.reduce((s, t) => s + (t.weight ?? 1), 0)
          const got = evaluatedTargets.filter(t => t.matched).reduce((s, t) => s + (t.weight ?? 1), 0)
          return total === 0 ? 0 : Math.round((got / total) * 100)
        })()
    return Math.max(0, match - contentPenaltyPts)
  }, [evaluatedTargets, baseScore, contentPenaltyPts])

  const totalWeight = useMemo(
    () => Math.max(1, evaluatedTargets.reduce((s, t) => s + (t.weight ?? 1), 0)),
    [evaluatedTargets],
  )
  // Deterministic readiness gain for a gap's keyword(s): its share of total
  // keyword weight, in score points — the same math Ready uses.
  const pointsFor = useMemo(() => (keywords: string[]): number => {
    const set = new Set(keywords.map(k => k.toLowerCase()))
    let w = 0
    evaluatedTargets.forEach(t => { if (set.has(t.kw.toLowerCase())) w += (t.weight ?? 1) })
    if (w === 0) w = 1
    return Math.max(1, Math.round((w / totalWeight) * 100))
  }, [evaluatedTargets, totalWeight])

  // The unified fix list. JD-tier fixes stay open until their keyword actually
  // lands on the CV (honest — an applied rewrite that missed the word keeps its
  // card); recruiter-check fixes vanish when the text stops triggering them.
  const matchedKw = useMemo(
    () => new Set(evaluatedTargets.filter(t => t.matched).map(t => t.kw.toLowerCase())),
    [evaluatedTargets],
  )
  const openFixes: V2Fix[] = useMemo(() => {
    const all = buildV2Fixes(cv, gapPlanQuery.data ?? null, pointsFor)
    return all.filter(f =>
      f.tier === 1 || f.keywords.length === 0 || !f.keywords.every(k => matchedKw.has(k.toLowerCase())))
  }, [cv, gapPlanQuery.data, pointsFor, matchedKw])

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
    baseScore, ready, delta: ready - baseScore, pointsFor,
    openFixes, skillRows, coveredCount,
    visibleCount, wordCount, pageFill, sheetContact,
  }
}
