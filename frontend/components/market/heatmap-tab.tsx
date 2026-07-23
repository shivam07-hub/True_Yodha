"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { jobs, users } from "@/lib/api"
import type { FollowedCompany, JobLocationFilters } from "@/lib/api"
import { buildSkillEvidenceIndex } from "@/lib/skill-intelligence"
import { CVPrerequisiteCard } from "./cv-prerequisite-card"
import { JobDrillPanel } from "./job-drill-panel"
import { SkillIntelligenceHeatmap } from "./skill-intelligence-heatmap"

interface HeatmapTabProps {
  token: string | null
  cvReadyForPersonalization: boolean
  cvReadiness: "ready" | "missing" | "processing" | "failed"
  cvUploadErrorCode?: string | null
  followedCompanies: FollowedCompany[]
  selectedCluster: string | null
  targetRoles: string[]
  targetLocations: string[]
  locFilters: JobLocationFilters
  paramSkill: string | null
  onBackToJobs?: () => void
  onPersonalise: () => void
  onViewSkillJobs: (skillName: string) => void
}

export function HeatmapTab({
  token,
  cvReadyForPersonalization,
  cvReadiness,
  cvUploadErrorCode,
  followedCompanies,
  selectedCluster,
  targetRoles,
  targetLocations,
  locFilters,
  paramSkill,
  onBackToJobs,
  onPersonalise,
  onViewSkillJobs,
}: HeatmapTabProps) {
  const queryClient = useQueryClient()
  const [selectedCell, setSelectedCell] = useState<{ ci: number; si: number } | null>(null)
  const [manualSaved, setManualSaved] = useState<Set<string>>(new Set())
  const [selectedSkillNames, setSelectedSkillNames] = useState<Set<string>>(new Set())
  const [skillsInitialized, setSkillsInitialized] = useState(false)

  const { data: skillDemandData } = useQuery({
    queryKey: ["mySkillDemand", token],
    queryFn: () => jobs.mySkillDemand(token!),
    enabled: !!token && cvReadyForPersonalization,
    staleTime: 30 * 60 * 1000,
  })
  const { data: userSkillsData } = useQuery({
    queryKey: ["heatmap-user-skills", token],
    queryFn: () => users.mySkills(token!),
    enabled: !!token && cvReadyForPersonalization,
    staleTime: 5 * 60 * 1000,
  })
  const { data: marketAnalyticsData } = useQuery({
    queryKey: ["heatmap-market-analytics", token, selectedCluster ?? "", locFilters],
    queryFn: () => jobs.analyticsForMe(token!, selectedCluster, locFilters),
    enabled: !!token,
    staleTime: 30 * 60 * 1000,
  })

  useEffect(() => {
    if (skillDemandData?.skills?.length && !skillsInitialized) {
      const sorted = skillDemandData.skills
        .filter((skill) => skill.weighted_demand > 0)
        .sort((a, b) => b.weighted_demand - a.weighted_demand)
        .map((skill) => skill.display_name)
      setSelectedSkillNames(paramSkill ? new Set([paramSkill, ...sorted.filter((skill) => skill !== paramSkill)]) : new Set(sorted))
      setSkillsInitialized(true)
    }
  }, [skillDemandData, skillsInitialized, paramSkill])

  const heatmapSkills = useMemo(() => {
    if (!cvReadyForPersonalization || !skillDemandData?.skills?.length) return []
    const base = skillDemandData.skills
      .filter((skill) => selectedSkillNames.size === 0 || selectedSkillNames.has(skill.display_name))
      .sort((a, b) => b.weighted_demand - a.weighted_demand)
      .map((skill) => skill.display_name)
    return paramSkill && base.includes(paramSkill)
      ? [paramSkill, ...base.filter((skill) => skill !== paramSkill)]
      : base
  }, [cvReadyForPersonalization, selectedSkillNames, skillDemandData, paramSkill])

  const heatmapCompanyNames = useMemo(
    () => followedCompanies.map((company) => company.company_name),
    [followedCompanies],
  )
  // ONE batched matrix fetch, not a per-company fan-out (IH3-REVERSED). The
  // /jobs/analytics/skill-heatmap endpoint already returns the full
  // company × skill matrix in one call; a followed company that has no data
  // still comes back seeded with all-zero skills, so a row is never "missing".
  const heatmapQuery = useQuery({
    queryKey: ["heatmap-matrix", heatmapCompanyNames.join(","), heatmapSkills.join(",")],
    queryFn: () => jobs.skillHeatmap(heatmapCompanyNames, heatmapSkills),
    enabled: heatmapCompanyNames.length > 0 && heatmapSkills.length > 0,
    staleTime: 30 * 60 * 1000,
  })

  const rowDataMap = useMemo(() => {
    const matrix = heatmapQuery.data?.matrix
    const map: Record<string, Record<string, number> | null> = {}
    followedCompanies.forEach((company) => {
      // null = still loading (drives the row skeleton); once the batched query
      // resolves every followed company has a row (backend seeds zeros).
      map[company.company_name] = matrix ? (matrix[company.company_name] ?? {}) : null
    })
    return map
  }, [followedCompanies, heatmapQuery.data])

  const heatmapFetching = heatmapQuery.isFetching

  const resolvedCell = useMemo(() => {
    if (!selectedCell) return null
    const company = followedCompanies[selectedCell.ci]
    const skill = heatmapSkills[selectedCell.si]
    return company && skill ? { companyName: company.company_name, skillName: skill } : null
  }, [selectedCell, followedCompanies, heatmapSkills])

  const { data: drillData, isLoading: drillLoading } = useQuery({
    queryKey: ["cellJobs", resolvedCell?.companyName, resolvedCell?.skillName],
    queryFn: () => jobs.search(resolvedCell!.companyName, { skill: resolvedCell!.skillName, pageSize: 50 }),
    enabled: !!resolvedCell,
    staleTime: 10 * 60 * 1000,
  })
  const saveMutation = useMutation({
    mutationFn: (jobId: string) => jobs.saveJob(token!, jobId),
    onSuccess: (_data, jobId) => {
      setManualSaved((prev) => new Set(Array.from(prev).concat(jobId)))
      queryClient.invalidateQueries({ queryKey: ["applications"] })
    },
  })

  const handleToggleSkill = useCallback((name: string) => {
    setSelectedSkillNames((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        if (next.size > 1) next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }, [])
  const handleCellSelect = useCallback((ci: number, si: number) => {
    setSelectedCell((prev) => (prev?.ci === ci && prev?.si === si ? null : { ci, si }))
  }, [])

  useEffect(() => {
    if (!cvReadyForPersonalization && selectedCell) setSelectedCell(null)
  }, [cvReadyForPersonalization, selectedCell])

  return (
    <div style={{ marginTop: 20 }}>
      {onBackToJobs ? (
        <button type="button" onClick={onBackToJobs} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--tm-interactive)", fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
          <span aria-hidden>&lt;-</span> Back to jobs
        </button>
      ) : null}
      {token && !cvReadyForPersonalization ? (
        <CVPrerequisiteCard readiness={cvReadiness as "missing" | "processing" | "failed"} errorCode={cvUploadErrorCode ?? null} />
      ) : (
        <SkillIntelligenceHeatmap
          companies={followedCompanies}
          rowDataMap={rowDataMap}
          skills={heatmapSkills}
          selectedCell={selectedCell}
          onCellSelect={handleCellSelect}
          allSkills={skillDemandData?.skills ?? []}
          selectedSkillNames={selectedSkillNames}
          onToggleSkill={handleToggleSkill}
          isLoggedIn={!!token}
          skillEvidence={buildSkillEvidenceIndex(userSkillsData)}
          trackedCompanyTotal={marketAnalyticsData?.total_companies ?? followedCompanies.length}
          targetRoles={targetRoles}
          targetLocations={targetLocations}
          isFetching={heatmapFetching}
          onPersonalise={onPersonalise}
          onViewSkillJobs={onViewSkillJobs}
        />
      )}
      {resolvedCell ? (
        <JobDrillPanel
          companyName={resolvedCell.companyName}
          skillName={resolvedCell.skillName}
          drillJobs={drillData?.jobs ?? []}
          isLoading={drillLoading}
          savedJobIds={new Set(Array.from(manualSaved))}
          onSave={(job) => saveMutation.mutate(job.job_id)}
          onClose={() => setSelectedCell(null)}
          isLoggedIn={!!token}
        />
      ) : null}
    </div>
  )
}
