import type { Metadata } from "next"
import { PublicFooter } from "@/components/public/public-footer"
import { PublicTopNav } from "@/components/public/top-nav"
import { InternshipApplyForm } from "@/components/internships/apply-form"

export const metadata: Metadata = {
  title: "Apply here — Myro",
  description: "Apply to a paid internship hosted on Myro.",
  robots: { index: false, follow: false },
}

export default function InternshipApplyPage({ params }: { params: { id: string } }) {
  return (
    <div className="tm-page-canvas" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <PublicTopNav showSignIn />
      <div style={{ flex: 1 }}>
        <InternshipApplyForm jobId={params.id} />
        <PublicFooter commons />
      </div>
    </div>
  )
}
