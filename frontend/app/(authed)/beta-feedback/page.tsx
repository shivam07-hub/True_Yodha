import type { Metadata } from "next"
import { BetaFeedbackForm } from "@/components/beta-feedback/beta-feedback-form"

export const metadata: Metadata = {
  title: "Optional Product Feedback | Myro",
  description: "Share optional Myro feedback. This is not a required internship selection task.",
  robots: { index: false, follow: false },
}

export default function BetaFeedbackPage() {
  return (
    <div className="bf-page">
      <main className="bf-page-shell">
        <BetaFeedbackForm />
      </main>
    </div>
  )
}
