export type RecruiterTab = "brief" | "talent" | "pipeline"

export interface RecruiterCandidate {
  id: string
  name: string
  title: string
  experience: string
  location: string
  l2Cluster: string
  readiness: "Ready now" | "Needs interview proof" | "Referral backed"
  skills: string[]
  evidence: string[]
  summary: string
}

export interface RecruiterBrief {
  companyName: string
  industry: string
  jobRole: string
  l2Cluster: string
  jobDescription: string
  mustHaveSkills: string[]
}

export interface RecruiterMatch extends RecruiterCandidate {
  score: number
  overlappingSkills: string[]
}

export const RECRUITER_TABS = [
  { id: "brief", label: "Role brief", hint: "Mirror the JD intake before matching." },
  { id: "talent", label: "Talent slate", hint: "Review filtered, ranked candidate evidence." },
  { id: "pipeline", label: "Pipeline", hint: "Move only the strongest few forward." },
] as const

export const L2_CLUSTERS = [
  "Python Backend",
  "Data Engineering",
  "Product Analytics",
  "Applied AI",
] as const

export const MUST_HAVE_SKILLS = [
  "FastAPI",
  "Django",
  "SQL",
  "PostgreSQL",
  "Docker",
  "Airflow",
  "Spark",
  "AWS",
  "Prompting",
  "LLM Evaluation",
] as const

export const DEFAULT_RECRUITER_BRIEF: RecruiterBrief = {
  companyName: "Myro",
  industry: "HR Tech",
  jobRole: "Python Backend Engineer",
  l2Cluster: "Python Backend",
  jobDescription:
    "Own APIs, data models, and recruiter-facing workflow surfaces. The role needs Python depth, strong SQL, and confidence shipping production systems.",
  mustHaveSkills: ["FastAPI", "SQL", "PostgreSQL", "Docker"],
}

export const RECRUITER_CANDIDATES: RecruiterCandidate[] = [
  {
    id: "cand-aarav",
    name: "Aarav Mehta",
    title: "Backend Engineer",
    experience: "4 years",
    location: "Bengaluru",
    l2Cluster: "Python Backend",
    readiness: "Ready now",
    skills: ["FastAPI", "SQL", "PostgreSQL", "Docker", "AWS"],
    evidence: ["built async APIs for fintech workflows", "owned production Postgres schema changes", "shipped Docker-based deployment playbooks"],
    summary: "Strong backend operator with clean API ownership and visible production depth.",
  },
  {
    id: "cand-rohan",
    name: "Rohan Shah",
    title: "Platform Engineer",
    experience: "3 years",
    location: "Pune",
    l2Cluster: "Python Backend",
    readiness: "Referral backed",
    skills: ["FastAPI", "Django", "SQL", "Docker"],
    evidence: ["migrated monolith services into FastAPI", "set up recruiter analytics endpoints", "paired with hiring teams on deployment fixes"],
    summary: "Balanced Python stack profile with enough delivery proof for fast-moving teams.",
  },
  {
    id: "cand-neha",
    name: "Neha Bansal",
    title: "ML Product Engineer",
    experience: "3 years",
    location: "Delhi",
    l2Cluster: "Applied AI",
    readiness: "Needs interview proof",
    skills: ["Prompting", "LLM Evaluation", "FastAPI", "AWS"],
    evidence: ["built prompt QA loops", "published evaluation dashboards", "connected AI services to internal APIs"],
    summary: "Useful when the role is AI-heavy, but not a pure backend shortlist lead.",
  },
  {
    id: "cand-ishita",
    name: "Ishita Rao",
    title: "Data Platform Engineer",
    experience: "5 years",
    location: "Hyderabad",
    l2Cluster: "Data Engineering",
    readiness: "Ready now",
    skills: ["Airflow", "Spark", "SQL", "AWS", "PostgreSQL"],
    evidence: ["owned nightly pipelines for 40M rows", "maintained Airflow DAG governance", "cut data freshness delays by 32%"],
    summary: "High-signal data engineering profile with production pipeline proof.",
  },
  {
    id: "cand-priya",
    name: "Priya Nair",
    title: "Backend + Data Engineer",
    experience: "4 years",
    location: "Chennai",
    l2Cluster: "Python Backend",
    readiness: "Ready now",
    skills: ["FastAPI", "SQL", "PostgreSQL", "Docker", "Airflow"],
    evidence: ["merged workflow APIs with batch systems", "supported recruiter-side dashboards", "kept CV-skill ingestion healthy in production"],
    summary: "Hybrid backend/data fit with very strong overlap for workflow-heavy product teams.",
  },
  {
    id: "cand-karan",
    name: "Karan Verma",
    title: "Analytics Engineer",
    experience: "3 years",
    location: "Mumbai",
    l2Cluster: "Product Analytics",
    readiness: "Referral backed",
    skills: ["SQL", "PostgreSQL", "AWS"],
    evidence: ["built hiring funnel reports", "maintained experimentation marts", "translated recruiter asks into analytics views"],
    summary: "Better for analytics operations than core backend ownership.",
  },
]

export function toggleSkill(list: string[], skill: string) {
  return list.includes(skill) ? list.filter((item) => item !== skill) : [...list, skill]
}

function descriptionBonus(description: string, candidate: RecruiterCandidate) {
  const lower = description.toLowerCase()
  return candidate.evidence.reduce((bonus, line) => bonus + (lower.includes(line.split(" ")[0]) ? 2 : 0), 0)
}

export function computeRecruiterMatches(
  brief: RecruiterBrief,
  candidates: RecruiterCandidate[] = RECRUITER_CANDIDATES,
): RecruiterMatch[] {
  return candidates
    .filter((candidate) => candidate.l2Cluster === brief.l2Cluster)
    .map((candidate) => {
      const overlappingSkills = brief.mustHaveSkills.filter((skill) => candidate.skills.includes(skill))
      const coverage = overlappingSkills.length * 14
      const fullClusterBonus = 38
      const readinessBonus =
        candidate.readiness === "Ready now" ? 12 : candidate.readiness === "Referral backed" ? 10 : 4
      const score = Math.min(98, 20 + fullClusterBonus + coverage + descriptionBonus(brief.jobDescription, candidate) + readinessBonus)
      return {
        ...candidate,
        score,
        overlappingSkills,
      }
    })
    .filter((candidate) => candidate.overlappingSkills.length > 0)
    .sort((a, b) => b.score - a.score)
}

export function buildRecruiterPipeline(matches: RecruiterMatch[]) {
  const top = matches.slice(0, 4)
  return [
    {
      label: "Shortlist ready",
      count: `${top.length}`,
      items: top.map((candidate) => `${candidate.name} · ${candidate.score}% match`),
    },
    {
      label: "Recruiter screen",
      count: `${Math.min(3, top.length)}`,
      items: top.slice(0, 3).map((candidate) => `${candidate.name} · screen for evidence depth`),
    },
    {
      label: "Hiring manager",
      count: `${Math.min(2, top.length)}`,
      items: top.slice(0, 2).map((candidate) => `${candidate.name} · stack alignment + ownership`),
    },
    {
      label: "Offer watch",
      count: `${Math.min(1, top.length)}`,
      items: top.slice(0, 1).map((candidate) => `${candidate.name} · keep warm through closure`),
    },
  ]
}
