import type { Metadata } from "next"
import { ReferralDashboard } from "@/components/b2b/referral-dashboard"
import { PublicWorkspaceFrame } from "@/components/b2b/public-workspace-frame"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Referral Workspace Preview — Myro",
  description:
    "Preview the referral-side Myro workspace: warm path queue, referral status loop, and reward logic for trusted introductions.",
  robots: { index: true, follow: true },
  alternates: { canonical: `${BASE}/referrals/workspace` },
  openGraph: {
    title: "Referral Workspace Preview — Myro",
    description:
      "A referral-side preview of Myro's warm-intro and trust workflow.",
    type: "website",
    url: `${BASE}/referrals/workspace`,
  },
}

export default function ReferralWorkspacePage() {
  return (
    <PublicWorkspaceFrame>
      <ReferralDashboard />
    </PublicWorkspaceFrame>
  )
}
