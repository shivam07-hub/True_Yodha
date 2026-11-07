import type { Metadata } from "next"
import { RecruiterTopBar } from "@/components/internships/recruiter-top-bar"
import { ApplicantView } from "@/components/internships/applicant-view"

export const metadata: Metadata = {
  title: "Applicant — Myro",
  robots: { index: false, follow: false },
}

export default function ApplicantPage({
  params,
}: {
  params: { jobId: string; applicationId: string }
}) {
  return (
    <div className="tm-page-canvas" style={{ minHeight: "100dvh" }}>
      <RecruiterTopBar />
      <ApplicantView jobId={decodeURIComponent(params.jobId)} applicationId={Number(params.applicationId)} />
    </div>
  )
}
