/**
 * CvTabView — the CV tab body ("3 Tailor per job" on the flow ribbon).
 *
 * Default = the Main CV. Picking a "Finish tailoring" card, or Stories'
 * "Tailor for job", switches this tab to that job's real tailored CVVersion
 * (`?tailor=<jobId>`, independent of the page-level `?jobId=` that opens the
 * separate Playground) — same CVExportView engine, so downloads/ATS/apply
 * all work exactly as they do today. Clicking any bullet opens the
 * provenance rail: which story it traces to, and — on a tailored copy —
 * whether it has since been molded for the job.
 */
"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import type { ApplicationResponse, CVStructured, CVVersion, UserProfile } from "@/lib/api"
import { cv as cvApi } from "@/lib/api"
import { MasterCVPanel } from "./library-master"
import { TailoredCVPanel } from "./tailored-cv-panel"
import { FinishTailoringLane } from "./finish-tailoring-lane"
import { ProvenanceRail } from "./provenance-rail"
import { displayCompany } from "./keyword-utils"
import { buildPointerIndex, matchedTerms } from "@/lib/cv/provenance"

interface CvTabViewProps {
  token: string
  cv: CVStructured | null
  currentBaseline: CVVersion | null
  applications: ApplicationResponse[]
  profile: UserProfile | null
  onEditMaster: () => void
  onOpenJob: (jobId: string) => void
  /** Version-history toggle owned by the flow ribbon above (library-view). */
  showHistory: boolean
}

function contactFrom(cv: CVStructured | null, profile: UserProfile | null) {
  const contact = cv?.contact
  return {
    name: contact?.name?.trim() || profile?.full_name?.trim() || "Your Name",
    title: contact?.title?.trim() || cv?.experience[0]?.role || profile?.target_roles?.[0] || "",
    location: contact?.location?.trim() || profile?.target_location || "",
    email: contact?.email?.trim() || "",
    phone: contact?.phone?.trim() || "",
    linkedin: contact?.linkedin?.trim() || profile?.linkedin_url || "",
  }
}

/** First bullet on the rendered CV — the provenance rail's default focus. */
function firstBulletOf(structured: CVStructured | null): string | null {
  for (const exp of structured?.experience ?? []) {
    if (exp.bullets.length > 0) return exp.bullets[0]
  }
  return null
}

export function CvTabView({
  token, cv, currentBaseline, applications, profile, onEditMaster, onOpenJob, showHistory,
}: CvTabViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tailorJobId = searchParams.get("tailor")

  function pickTailored(jobId: string) {
    const next = new URLSearchParams(searchParams.toString())
    next.set("view", "cv")
    next.set("tailor", jobId)
    router.push(`/cv?${next.toString()}`)
  }
  function switchToMain() {
    const next = new URLSearchParams(searchParams.toString())
    next.delete("tailor")
    router.push(`/cv?${next.toString()}`)
  }

  const tailoredVersionsQuery = useQuery({
    queryKey: ["cv", "versions", tailorJobId],
    queryFn: () => cvApi.versions.list(token, tailorJobId),
    enabled: !!tailorJobId,
  })
  const tailoredVersion: CVVersion | null = useMemo(() => {
    const versions = tailoredVersionsQuery.data?.versions ?? []
    if (versions.length === 0) return null
    return [...versions].sort((a, b) => b.id - a.id)[0]
  }, [tailoredVersionsQuery.data])
  const tailoredStructured = tailoredVersion?.cv_structured ?? null
  const tailoredApp = tailorJobId ? applications.find((a) => a.job_id === tailorJobId) ?? null : null

  const profileQuery = useQuery({
    queryKey: ["cv", "careerProfile"],
    queryFn: () => cvApi.career.profile(token),
  })
  const pointerIndex = useMemo(() => buildPointerIndex(profileQuery.data), [profileQuery.data])

  const activeStructured = tailorJobId ? tailoredStructured : cv
  const [selectedBulletId, setSelectedBulletId] = useState<string | null>(null)
  const [selectedBulletText, setSelectedBulletText] = useState<string | null>(null)

  // Reset selection when the surface changes (master <-> a different tailored
  // job) and default to the first bullet so the rail is never empty.
  useEffect(() => {
    setSelectedBulletId(null)
    setSelectedBulletText(firstBulletOf(activeStructured))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tailorJobId, activeStructured])

  function handleBulletClick(id: string, text: string) {
    setSelectedBulletId(id)
    setSelectedBulletText(text)
  }

  const matched = selectedBulletText ? pointerIndex.get(selectedBulletText.trim()) ?? null : null
  const terms = tailoredApp
    ? matchedTerms(selectedBulletText ?? "", tailoredApp.matched_skills ?? tailoredApp.skills)
    : []

  // The rail holds the tailoring context (other jobs to finish + the story
  // behind the selected line) so the CV sheet leads the main column — the
  // same rail-beside-artifact shell as Jobs / Collections. Story only shows
  // when there's a rendered CV to trace a bullet from.
  const showStory = !!activeStructured
  const tailoredForRail = tailorJobId
    ? { company: displayCompany(tailoredVersion?.company_name) || displayCompany(tailoredApp?.company) || "this job" }
    : null

  return (
    <div className="tm-lib-workspace">
      <aside className="tm-lib-rail" aria-label="Tailoring context">
        <FinishTailoringLane token={token} onOpenJob={pickTailored} />
        {showStory && (
          <ProvenanceRail
            bulletText={selectedBulletText ?? ""}
            story={matched?.story ?? null}
            role={matched?.role ?? null}
            tailoredFor={tailoredForRail}
            matchedTerms={terms}
          />
        )}
      </aside>

      <div className="tm-lib-workmain tm-lib-cv-interactive">
        {tailorJobId ? (
          tailoredStructured ? (
            <TailoredCVPanel
              token={token}
              structured={tailoredStructured}
              hidden={new Set(tailoredVersion?.hidden_items ?? [])}
              contact={contactFrom(tailoredStructured, profile)}
              profile={profile}
              versionId={tailoredVersion?.id ?? null}
              footerMarkHidden={tailoredVersion?.footer_mark_hidden ?? false}
              company={displayCompany(tailoredVersion?.company_name) || displayCompany(tailoredApp?.company) || ""}
              jobTitle={tailoredVersion?.job_title ?? tailoredApp?.title ?? ""}
              jobId={tailorJobId}
              matchScore={tailoredApp?.match_score ?? 0}
              appliedAt={tailoredApp?.applied_at ?? null}
              sectionOrder={tailoredVersion?.section_order}
              onBulletClick={handleBulletClick}
              selectedBulletId={selectedBulletId}
              onEditInPlayground={onOpenJob}
              onSwitchToMain={switchToMain}
            />
          ) : (
            <p className="tm-lib-empty-sub" style={{ padding: "24px 4px" }}>
              {tailoredVersionsQuery.isLoading ? "Loading the tailored copy…" : "Couldn't find a tailored copy for this job yet."}
            </p>
          )
        ) : (
          <MasterCVPanel
            token={token}
            baseline={currentBaseline}
            cv={cv}
            profile={profile}
            onEditMaster={onEditMaster}
            showHistory={showHistory}
            onBulletClick={handleBulletClick}
            selectedBulletId={selectedBulletId}
          />
        )}
      </div>
    </div>
  )
}
