import type { Metadata } from "next"
import {
  Activity,
  HandCoins,
  Network,
  UserRoundCheck,
} from "lucide-react"
import { B2BDoorPage, type B2BDoorContent } from "@/components/public/b2b-door-page"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Myro for Referral Partners — Warm Intro Dashboard",
  description:
    "Turn employees, alumni, and trusted connectors into a structured referral layer with candidate fit, warm-path visibility, and accountable follow-through.",
  robots: { index: true, follow: true },
  alternates: { canonical: `${BASE}/referrals` },
  openGraph: {
    title: "Myro for Referral Partners — Warm Intro Dashboard",
    description:
      "A referral-side mirror of Myro's candidate engine: aligned profiles, warm introductions, and status visibility in one flow.",
    type: "website",
    url: `${BASE}/referrals`,
  },
}

const REFERRAL_PAGE: B2BDoorContent = {
  strap: "referral partner pilot · myro for warm introductions",
  headline: (
    <>
      Turn referrals into a <em>trusted hiring layer</em>.
    </>
  ),
  subhead:
    "Give alumni, employees, and trusted connectors a clean dashboard: who matches which JD, where the proof is, and what happens after the intro.",
  chips: ["Warm intros", "Match confidence", "Referral status", "Trust ledger"],
  metrics: [
    { label: "Connector view", value: "high-signal only" },
    { label: "Feedback loop", value: "applied → shortlisted" },
    { label: "Shared language", value: "same L2 skill graph" },
  ],
  boardTitle: "Backend hiring · referral queue",
  boardLabel: "warm-path preview",
  boardRows: [
    {
      name: "Priya Nair",
      meta: "Warm path · ex-ZS network · Python cluster",
      score: "91%",
      summary: "Strong fit plus a direct introduction route through a current engineering lead in the target team.",
    },
    {
      name: "Karan Verma",
      meta: "Warm path · alumni connector · data backend",
      score: "86%",
      summary: "Best suited when the referrer can frame analytics depth and production cloud work together.",
    },
    {
      name: "Neha Bansal",
      meta: "Warm path · manager referral · FastAPI stack",
      score: "82%",
      summary: "Good candidate for teams that want recent backend build proof and a connector willing to vouch actively.",
    },
  ],
  workflowTitle: "Referral workflow",
  workflowBody:
    "The referral layer should not become Slack chaos. Myro can narrow the queue, show who is actually aligned, and keep outcomes visible for the person making the introduction.",
  workflowBullets: [
    "Start from open JDs and surface only candidates who already clear the L2 skill threshold.",
    "Show the warmest connector path and the candidate context needed for a credible intro.",
    "Track whether the intro became an application, a shortlist, or a dead end so trust compounds over time.",
  ],
  primaryCta: {
    href: "mailto:hello@himyro.com?subject=Myro%20Referral%20Pilot",
    label: "Request referral pilot",
    external: true,
  },
  secondaryCta: { href: "/cv-preview", label: "See candidate side" },
  steps: [
    {
      title: "Pick the role first",
      body: "Referrers should work from real open JDs, not vague asks. Myro can anchor every intro to an actual hiring need.",
    },
    {
      title: "Choose the warmest path",
      body: "The system can sort candidates by match strength and connector confidence so referrals stay selective and credible.",
    },
    {
      title: "Keep the loop accountable",
      body: "A referral dashboard becomes useful when it shows status, feedback, and repeatability instead of vanishing after the message is sent.",
    },
  ],
  features: [
    {
      title: "Connector trust layer",
      body: "Referrers should see only candidates worth backing. The dashboard can filter down to people they can introduce with confidence.",
      icon: <Network size={18} />,
    },
    {
      title: "Outcome ledger",
      body: "Track intros, responses, shortlists, and dead ends so the system learns which warm paths create real hiring movement.",
      icon: <Activity size={18} />,
    },
    {
      title: "Referral-ready briefs",
      body: "Each candidate row can package the exact proof a referrer needs: fit summary, key skills, and why this role makes sense.",
      icon: <UserRoundCheck size={18} />,
    },
    {
      title: "Reward and access hooks",
      body: "This layer can later power referral rewards, premium reports, or network participation without changing the underlying skill mirror.",
      icon: <HandCoins size={18} />,
    },
  ],
  mirrorTitle: "The referral side should sit between candidate proof and recruiter action.",
  mirrorBody:
    "That makes it a real operational mirror: seekers build signal, referrers route signal, recruiters consume signal, and everyone stays inside one shared skill language.",
  mirrorPoints: [
    "Referral partners read the same candidate skill data that powers the user score and readiness view.",
    "Only candidates aligned to the JD's L2 cluster appear, so intros stay structured rather than social-only.",
    "Recruiters receive a filtered, trusted dataset because referral flow sits on top of the same mirrored candidate records.",
  ],
  bottomTitle: "Make every introduction count more than once.",
  bottomBody:
    "This gives Myro a referral operating layer that feels useful in a crowded HR-tech market: not just sending intros, but structuring, sorting, and learning from them.",
}

export default function ReferralsPage() {
  return <B2BDoorPage content={REFERRAL_PAGE} />
}
