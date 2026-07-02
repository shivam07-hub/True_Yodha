import type { Metadata } from "next"
import {
  BriefcaseBusiness,
  ClipboardList,
  Filter,
  Handshake,
} from "lucide-react"
import { B2BDoorPage, type B2BDoorContent } from "@/components/public/b2b-door-page"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Myro for Recruiters — Skill-Based Hiring Mirror",
  description:
    "Post a JD, lock decisioning to L2-cluster skills, and review a smaller, evidence-backed shortlist from the same skill graph Myro uses for seekers.",
  robots: { index: true, follow: true },
  alternates: { canonical: `${BASE}/recruiters` },
  openGraph: {
    title: "Myro for Recruiters — Skill-Based Hiring Mirror",
    description:
      "A recruiter-side mirror of Myro's candidate engine: JD in, L2-skill shortlist out.",
    type: "website",
    url: `${BASE}/recruiters`,
  },
}

const RECRUITER_PAGE: B2BDoorContent = {
  strap: "recruiter pilot · myro for hiring teams",
  headline: (
    <>
      Shortlist by <em>skill evidence</em>, not just by CV polish.
    </>
  ),
  subhead:
    "Paste a JD, keep the hiring decision on L2-cluster skills only, and review candidates through the same skill graph Myro already uses on the seeker side.",
  chips: ["JD → L2 cluster", "Ranked shortlist", "Evidence from CV", "3–4 profile handoff"],
  metrics: [
    { label: "Same graph", value: "L1–L5 taxonomy" },
    { label: "Output", value: "3–4 strong profiles" },
    { label: "Decision style", value: "one-click shortlist" },
  ],
  boardTitle: "Python backend role · shortlist preview",
  boardLabel: "mirror dataset",
  boardRows: [
    {
      name: "Aarav Mehta",
      meta: "L2 cluster · Python · APIs · SQL",
      score: "92%",
      summary: "Strong evidence in Django APIs, async service work, and production Postgres ownership.",
    },
    {
      name: "Ishita Rao",
      meta: "L2 cluster · Python · Data pipelines · AWS",
      score: "88%",
      summary: "Good fit for analytics-heavy backend roles with clear ETL and deployment proof in the CV.",
    },
    {
      name: "Rohan Shah",
      meta: "L2 cluster · Python · FastAPI · Docker",
      score: "84%",
      summary: "Best when the role needs API delivery speed, container comfort, and hands-on build signal.",
    },
  ],
  workflowTitle: "Recruiter workflow",
  workflowBody:
    "Start with one JD. Myro normalises the role, narrows the comparison to L2 skills, and returns a smaller, explainable slate instead of an opaque ATS dump.",
  workflowBullets: [
    "Capture JD, company, industry, role, and must-have skills in one post flow.",
    "Lock comparison to L2-cluster skills for apples-to-apples candidate ranking.",
    "Hand hiring teams a tighter shortlist with evidence lines, not only keyword counts.",
  ],
  primaryCta: {
    href: "mailto:hello@himyro.com?subject=Myro%20Recruiter%20Pilot",
    label: "Request recruiter pilot",
    external: true,
  },
  secondaryCta: { href: "/recruiters/workspace", label: "Preview workspace" },
  steps: [
    {
      title: "Post the JD once",
      body: "Use the same mirrored fields as the seeker CV side: job description, company, industry, role, and skill requirements.",
    },
    {
      title: "Review ranked talent",
      body: "See only candidates inside the selected L2 cluster, along with match confidence and proof extracted from their CV data.",
    },
    {
      title: "Move the top few forward",
      body: "Share 3–4 strongest profiles into recruiter workflow, interviews, or agency handoff without re-sorting the pile manually.",
    },
  ],
  features: [
    {
      title: "Mirror dataset",
      body: "The recruiter view reads the same structured skill graph the candidate side writes into, so the language stays identical on both ends.",
      icon: <BriefcaseBusiness size={18} />,
    },
    {
      title: "Structured JD intake",
      body: "A cleaner replacement for free-form requisition chaos: company, role, industry, JD, and required skills captured in one predictable schema.",
      icon: <ClipboardList size={18} />,
    },
    {
      title: "L2-only homogeneity",
      body: "Recruiters decide from L2 clusters first, which keeps comparison fair and reduces noisy cross-skill CV inflation.",
      icon: <Filter size={18} />,
    },
    {
      title: "Human-ready handoff",
      body: "The output is not a black-box score. It is a recruiter-readable panel with evidence, strengths, and why each profile made the cut.",
      icon: <Handshake size={18} />,
    },
  ],
  mirrorTitle: "A true mirror means both sides speak the same skill language.",
  mirrorBody:
    "The B2C side tells seekers how companies read them. The B2B side should tell recruiters which seekers are strongest for a role, using the exact same dataset and taxonomy.",
  mirrorPoints: [
    "Candidate skills are attached to the same normalized taxonomy that recruiter-side filters read from.",
    "JD skill requirements become the recruiter-side mirror of CV skill extraction, not a separate scoring universe.",
    "Every shortlist row can show evidence because the system is reading mirrored CV structure, not only text search.",
  ],
  bottomTitle: "Need the cream of the CV, not another pile?",
  bottomBody:
    "This slice sets up the recruiter-side operating layer without rebuilding the platform. It gives Myro a credible HR-tech front door before the full dashboard lands.",
}

export default function RecruitersPage() {
  return <B2BDoorPage content={RECRUITER_PAGE} />
}
