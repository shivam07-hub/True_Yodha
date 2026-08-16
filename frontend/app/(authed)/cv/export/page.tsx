/**
 * /cv/export — the full-page tailored CV export (Design C).
 *
 * The high-intent download surface: the user picked a job, tuned the CV in the
 * playground, and lands here to save the tailored PDF and open the company's
 * careers page (apply-beside-download). Reuses the same `useCVPlayground` data
 * as /cv so the rendered `.cvb-pdf-page` matches the playground preview exactly.
 */
"use client"

import { Suspense, useEffect, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { CVExportView } from "@/components/cv/builder/cv-export-view"
import { CvSkeleton } from "@/components/loading/page-skeletons"
import { jobs as jobsApi, users } from "@/lib/api"
import { dataKeys } from "@/lib/domain-data"
import { useAuth } from "@/lib/hooks/use-auth"
import { useCVPlayground } from "@/lib/hooks/use-cv-playground"

import "../cv-fonts.css"
import "../cv-sheet.css"
import "../cv-builder.css"

function CVExportPage() {
  const router = useRouter()
  const { token, ready } = useAuth()
  const searchParams = useSearchParams()
  const jobId = searchParams.get("jobId")
  const matchScore = Number(searchParams.get("score") ?? 0)

  const playground = useCVPlayground({ token, jobId, enabled: !!ready && !!token && !!jobId })
  const cvData = playground.structured
  const bodyText = playground.currentBaseline?.body_text?.trim() ?? ""
  const hasBaseline = playground.baselines.length > 0

  const profileQuery = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token!),
    enabled: !!ready && !!token,
    staleTime: 5 * 60 * 1000,
  })
  const profile = profileQuery.data ?? null

  // Seed the close-the-loop tracker: if this job is already marked applied, the
  // export shows "Applied on …" instead of the "Mark as applied" nudge.
  const applicationsQuery = useQuery({
    queryKey: dataKeys.applications(),
    queryFn: () => jobsApi.applications(token!),
    enabled: !!ready && !!token,
    staleTime: 2 * 60 * 1000,
  })
  const appliedAt = useMemo(() => {
    const row = applicationsQuery.data?.find(a => a.job_id === jobId)
    return row && row.status !== "saved" ? row.applied_at : null
  }, [applicationsQuery.data, jobId])

  const company = playground.selectedVersion?.company_name ?? "Selected role"
  const jobTitle = playground.selectedVersion?.job_title ?? ""

  const contact = useMemo(() => ({
    name: cvData?.contact?.name?.trim() || profile?.full_name?.trim() || "Your name",
    title: cvData?.contact?.title?.trim() || cvData?.experience[0]?.role || "",
    location: cvData?.contact?.location?.trim() || profile?.target_location || "",
    email: cvData?.contact?.email?.trim() || "",
    phone: cvData?.contact?.phone?.trim() || "",
    linkedin: cvData?.contact?.linkedin?.trim() || profile?.linkedin_url || "",
  }), [profile, cvData])

  // A direct hit without a job, or before any CV exists, has nothing to export.
  const bootstrapping = !ready || profileQuery.isLoading || playground.versionsLoading
  useEffect(() => {
    if (bootstrapping) return
    if (!jobId || !hasBaseline) router.replace("/cv")
  }, [bootstrapping, jobId, hasBaseline, router])

  if (bootstrapping || !jobId || !hasBaseline) return <CvSkeleton />

  return (
    <div className="cvb-scope">
      <div className="cvb-export-fullpage">
        {cvData ? (
          <CVExportView
            token={token!}
            cv={cvData}
            hidden={playground.hiddenItems}
            contact={contact}
            profile={profile}
            context="tailored"
            versionId={playground.selectedVersion?.id ?? null}
            footerMarkHidden={playground.selectedVersion?.footer_mark_hidden ?? false}
            company={company}
            jobTitle={jobTitle}
            jobId={jobId}
            matchScore={matchScore}
            appliedAt={appliedAt}
            onBack={() => router.push(`/cv?jobId=${encodeURIComponent(jobId)}`)}
            backLabel="Back to playground"
          />
        ) : bodyText ? (
          <pre className="whitespace-pre-wrap p-8 text-sm leading-6 text-[var(--tm-text)]">{bodyText}</pre>
        ) : null}
      </div>
    </div>
  )
}

export default function CVExportPageWithSuspense() {
  return (
    <Suspense fallback={<CvSkeleton />}>
      <CVExportPage />
    </Suspense>
  )
}
