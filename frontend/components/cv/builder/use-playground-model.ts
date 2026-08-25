/**
 * usePlaygroundModel — the CV Playground v2 read model.
 *
 * Turns (job, JD coverage, live CV, hidden set) into what the v2 surface renders:
 * the ONE Match score, the requirement count for the header, the coverage gap
 * requirements for the intake seed, the content-quality fix list, and the sheet
 * metadata. Pure reads — mutations stay in the view.
 *
 * Taxonomy is banned here (2026-07-18): the job's requirements, the score, and
 * the JD-fix work ALL come from jd_coverage (the JD's REAL requirements, parsed
 * by a judgment-lane model and matched against the user's stories + CV lines) —
 * never job_skills. The old keyword-landing layer (verbatim taxonomy terms) is
 * gone: coverage IS the Match score (match-score.ts), and JD weak/gap work lives
 * on the Job-fit tab → Tailor with Mentor. Only the content-quality fixes
 * (Quantify / Verb / Cut) stay in the Fixes rail — those are CV-intrinsic.
 */
"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import type { CVStructured, JDCoverageResponse, JobPathResponse, UserProfile } from "@/lib/api"
import { jobs as jobsApi, cv as cvApi } from "@/lib/api"
import { itemId } from "@/lib/cv-compose"
import { dataKeys } from "@/lib/domain-data"
import { IDEAL_CV_SPEC, estimateLines, pageFillFromLines, type PageFill } from "@/lib/cv/page-fill"
import { matchScore } from "./match-score"
import { resolvePlaygroundCompany } from "./keyword-utils"

export interface PlaygroundModelOpts {
  /** The single CV scan for this render (useCvDiagnosis). The model reads its
   *  penalty rather than re-scanning — see that hook for why four memoised
   *  scans of identical inputs was still four scans. */
  penalty: number
  /** "master" = the Main-CV surface: no job, no JD coverage. Score is the
   *  CV-intrinsic Myro Score (passed as masterScore), fixes are recruiter-check
   *  content only, and no per-job point-gain is claimed. Default "job". */
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
  // Master mode has no job → the job reads never fire (a blank jobId would
  // otherwise 404). Content-quality fixes work from the CV alone.
  const isMaster = opts?.mode === "master"
  const jobPathQuery = useQuery({
    queryKey: dataKeys.jobPath(jobId),
    queryFn: () => jobsApi.path(token, jobId),
    staleTime: 5 * 60 * 1000,
    enabled: !isMaster,
  })
  const applicationsQuery = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token),
    staleTime: 60_000,
    enabled: !isMaster,
  })
  // Lane C — THE JD source. The job's real requirements classified against the
  // user's career stories + CV lines (covered / partial / missing). Drives the
  // Match score (its coverage IS the score), the header requirement count, the
  // Job-fit rail, and the intake/weave gap list. Replaces job_skills taxonomy.
  const coverageQuery = useQuery<JDCoverageResponse>({
    queryKey: ["jd-coverage", jobId],
    queryFn: () => cvApi.career.jdCoverage(token, jobId),
    staleTime: 5 * 60 * 1000,
    enabled: !isMaster,
  })

  const job: Partial<JobPathResponse> = jobPathQuery.data ?? {}
  const application = applicationsQuery.data?.find(a => a.job_id === jobId) ?? null
  const company = resolvePlaygroundCompany(job.company, undefined)
  const jobTitle = job.job_title ?? "Untitled role"
  const jdText = (application?.job_description ?? "").trim()
  const roles = useMemo(
    () => cv.experience.map((e, i) => ({ index: i, label: `${e.role} · ${e.company}` })),
    [cv.experience],
  )

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

  // Content-quality penalty (#34 S3): open recruiter-check findings subtract real
  // points from the score, and each fix returns its exact points on a real text
  // change. Computed from the ONE scan, over ALL findings — dismissing a card
  // hides it, it never buys back the points.
  const contentPenaltyPts = opts?.penalty ?? 0

  // Coverage counts drive the score. Null until the parse lands (or if it finds
  // nothing) → the score falls back to the job's deterministic readiness, never
  // a fabricated 0.
  const coverageCounts = useMemo(() => {
    const c = coverageQuery.data
    return c && c.requirements.length > 0
      ? { covered: c.covered, weak: c.weak, gap: c.gap }
      : null
  }, [coverageQuery.data])
  const hasSemantic = !isMaster && coverageCounts != null

  // Master: the header shows the Myro Score verbatim (radar-based; a bullet
  // rewrite never moves it, so the content penalty never subtracts from it). Job:
  // coverage − content penalty, with the deterministic readiness as the honest
  // pre-coverage fallback.
  const fallbackPct = isMaster ? Math.round(opts?.masterScore ?? 0) : (job.readiness_pct ?? 0)
  const ready = useMemo(() => {
    if (isMaster) return fallbackPct
    return matchScore(coverageCounts, fallbackPct, contentPenaltyPts)
  }, [isMaster, fallbackPct, coverageCounts, contentPenaltyPts])

  // The header requirement count — the SAME number as the Job-fit denominator
  // (coverage requirements), so the two never disagree. The gap requirements
  // seed the "Add from your experience" intake with the JD's real gaps.
  const requirements = useMemo(
    () => coverageQuery.data?.requirements ?? [],
    [coverageQuery.data],
  )
  const reqCount = requirements.length
  const gapRequirements = useMemo(
    () => requirements.filter(r => r.status === "gap").map(r => r.requirement),
    [requirements],
  )

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
    job, application, company, jobTitle, jdText, roles,
    visibleText, ready, hasSemantic, coverageQuery, reqCount, gapRequirements,
    visibleCount, wordCount, pageFill, sheetContact,
  }
}
