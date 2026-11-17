import type { Metadata } from "next"
import { PublicFooter } from "@/components/public/public-footer"
import { RecruiterTopBar } from "@/components/internships/recruiter-top-bar"
import { RecruiterDoor } from "@/components/internships/recruiter-door"

const BASE = "https://www.himyro.com"

// The recruiter door is the post itself. A founder filling one seat, a paid
// internship or a job, came to reach people who already have a CV here, not to
// read a pitch or a sample shortlist. Once she has posted, the same door is her
// home: the post, who it reaches, who applied. /internships/post forwards here
// (next.config.mjs).
export const metadata: Metadata = {
  title: "Post an internship or job — Myro",
  description:
    "Post a paid internship or a job on Myro. Each applicant sends a CV written for your opening.",
  alternates: { canonical: `${BASE}/recruiters` },
  robots: { index: true, follow: true },
}

export default function RecruitersPage() {
  return (
    <div className="tm-page-canvas" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <RecruiterTopBar />
      <div style={{ flex: 1 }}>
        <RecruiterDoor />
        <PublicFooter commons />
      </div>
    </div>
  )
}
