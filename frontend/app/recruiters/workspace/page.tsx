import type { Metadata } from "next"
import { RecruiterDashboard } from "@/components/b2b/recruiter-dashboard"
import { PublicWorkspaceFrame } from "@/components/b2b/public-workspace-frame"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Recruiter Workspace Preview — Myro",
  description:
    "Preview the recruiter-side Myro workspace: structured JD intake, L2-cluster talent slate, and a tight shortlist pipeline.",
  robots: { index: true, follow: true },
  alternates: { canonical: `${BASE}/recruiters/workspace` },
  openGraph: {
    title: "Recruiter Workspace Preview — Myro",
    description:
      "A recruiter-side preview of Myro's structured JD and shortlist workflow.",
    type: "website",
    url: `${BASE}/recruiters/workspace`,
  },
}

export default function RecruiterWorkspacePage() {
  return (
    <PublicWorkspaceFrame>
      <RecruiterDashboard />
    </PublicWorkspaceFrame>
  )
}
