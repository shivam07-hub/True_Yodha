import type { Metadata } from "next"
import { BetaFeedbackForm } from "@/components/beta-feedback/beta-feedback-form"

export const metadata: Metadata = {
  title: "Beta Feedback Assignment | Myro",
  description: "Submit your final Myro beta testing assessment.",
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
