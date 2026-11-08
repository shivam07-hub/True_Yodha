import type { Metadata } from "next"
import { InternshipReview } from "@/components/internships/internship-review"

export const metadata: Metadata = {
  title: "Internships to check | Myro",
  robots: { index: false, follow: false },
}

export default function InternshipReviewPage() {
  return (
    <div className="tm-page-canvas" style={{ minHeight: "100dvh" }}>
      <InternshipReview />
    </div>
  )
}
