export type ReferralTab = "queue" | "status" | "rewards"

export interface ReferralEntry {
  id: string
  candidate: string
  company: string
  role: string
  connector: string
  connectorType: "Employee" | "Alumni" | "Founder network"
  status: "Ready to intro" | "Drafting message" | "Manager replied" | "Interview live"
  score: number
  reward: number
  skills: string[]
  trustNote: string
  nextStep: string
}

export const REFERRAL_TABS = [
  { id: "queue", label: "Warm queue", hint: "Sort who is worth backing first." },
  { id: "status", label: "Status loop", hint: "Keep intros visible after the send." },
  { id: "rewards", label: "Rewards", hint: "Show who is driving real movement." },
] as const

export const REFERRAL_COMPANIES = ["All companies", "Razorpay", "CRED", "Rippling", "Atlassian"] as const

export const REFERRAL_ENTRIES: ReferralEntry[] = [
  {
    id: "ref-priya",
    candidate: "Priya Nair",
    company: "Rippling",
    role: "Backend Engineer",
    connector: "Keshav Menon",
    connectorType: "Employee",
    status: "Ready to intro",
    score: 94,
    reward: 300,
    skills: ["FastAPI", "SQL", "PostgreSQL"],
    trustNote: "Current engineering lead in the same org can vouch for systems depth.",
    nextStep: "Send a warm intro with backend and workflow evidence in one note.",
  },
  {
    id: "ref-aarav",
    candidate: "Aarav Mehta",
    company: "Razorpay",
    role: "Python Platform Engineer",
    connector: "Nishtha Suri",
    connectorType: "Alumni",
    status: "Drafting message",
    score: 91,
    reward: 250,
    skills: ["FastAPI", "Docker", "AWS"],
    trustNote: "Alumni connector already knows the hiring manager's expectations for proof depth.",
    nextStep: "Finish the intro draft and attach the strongest production evidence lines.",
  },
  {
    id: "ref-neha",
    candidate: "Neha Bansal",
    company: "CRED",
    role: "AI Product Engineer",
    connector: "Founder circle",
    connectorType: "Founder network",
    status: "Manager replied",
    score: 88,
    reward: 350,
    skills: ["Prompting", "LLM Evaluation", "FastAPI"],
    trustNote: "Warmest path comes from a founder-introduced product lead already curious about AI ops.",
    nextStep: "Package a sharper role-fit note before the hiring manager screen.",
  },
  {
    id: "ref-rohan",
    candidate: "Rohan Shah",
    company: "Atlassian",
    role: "Backend Engineer",
    connector: "Shruti Rao",
    connectorType: "Employee",
    status: "Interview live",
    score: 86,
    reward: 400,
    skills: ["Django", "FastAPI", "SQL"],
    trustNote: "The connector is already staying close to the loop and can help debrief after each round.",
    nextStep: "Use post-interview feedback to decide whether a second internal nudge helps.",
  },
  {
    id: "ref-ishita",
    candidate: "Ishita Rao",
    company: "Razorpay",
    role: "Data Platform Engineer",
    connector: "Nishtha Suri",
    connectorType: "Alumni",
    status: "Ready to intro",
    score: 84,
    reward: 220,
    skills: ["Airflow", "Spark", "AWS"],
    trustNote: "Connector trusts the data depth, but wants a tighter role narrative before sending.",
    nextStep: "Rewrite the intro around platform scale and pipeline ownership.",
  },
]

export function buildReferralQueue(company: string) {
  return REFERRAL_ENTRIES
    .filter((entry) => company === "All companies" || entry.company === company)
    .sort((a, b) => b.score - a.score)
}

export function buildReferralStatus(entries: ReferralEntry[]) {
  const map = new Map<string, ReferralEntry[]>()
  for (const label of ["Ready to intro", "Drafting message", "Manager replied", "Interview live"]) {
    map.set(label, [])
  }
  for (const entry of entries) {
    map.get(entry.status)?.push(entry)
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }))
}

export function buildReferralLeaders(entries: ReferralEntry[]) {
  const totals = new Map<string, { connector: string; intros: number; rewards: number }>()
  for (const entry of entries) {
    const current = totals.get(entry.connector) ?? { connector: entry.connector, intros: 0, rewards: 0 }
    current.intros += 1
    current.rewards += entry.reward
    totals.set(entry.connector, current)
  }
  return Array.from(totals.values()).sort((a, b) => b.rewards - a.rewards)
}
