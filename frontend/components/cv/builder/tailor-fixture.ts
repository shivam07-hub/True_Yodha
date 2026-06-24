/**
 * Tailoring surface (v2 journey) — frontend contract + a design fixture.
 *
 * Shaped like the future projection endpoint (GET /cv/tailor/{jobId}): the user's
 * reservoir PROJECTED onto a job — readiness, the two underlying scores, how many
 * points were reused from the inventory, the inline fixes that move readiness, and
 * the projected CV (canonical phrasing per point — reuses the reservoir role/point
 * types, so the body renders the same clean CV).
 *
 * Phase: SHADOW — the projection engine isn't built. The view binds to this fixture;
 * swapping to the live endpoint later changes only the data source. Types move to
 * lib/api.ts when the route lands. Spec: project_cv_endtoend_journey.md.
 */
import type { ReservoirRole } from "@/lib/api"

// A gap → one honest move. "sharpen" = stretch a skill one level (evidence-gated);
// "add" = surface a hidden skill onto a bullet; "practice" = build it in Forge.
export type FixKind = "sharpen" | "add" | "practice"

export interface TailorFix {
  id: string
  skill: string          // display name (the content)
  kind: FixKind
  /** Readiness points this fix adds. 0 for practice (earned later, not now). */
  delta: number
  from_level?: number    // sharpen: current level on the CV
  to_level?: number      // sharpen: the n+1 stretch
}

export interface TailorView {
  job_title: string
  org: string | null
  /** Current readiness for THIS job, 0–100. Climbs as sharpen/add fixes land. */
  ready: number
  /** Readiness when this tailor started — drives the "▲ +N" delta. */
  base: number
  skill_fit: number      // on-tap detail
  recruiter_read: number // on-tap detail
  /** Points reused from the inventory (the compounding, made felt). */
  reused: number
  fixes: TailorFix[]
  roles: ReservoirRole[] // the projected CV body (canonical phrasing per point)
  summary: string | null
}

export const TAILOR_FIXTURE: TailorView = {
  job_title: "Senior Product Manager",
  org: "Razorpay",
  ready: 71,
  base: 71,
  skill_fit: 68,
  recruiter_read: 74,
  reused: 8,
  fixes: [
    { id: "f1", skill: "Stakeholder Management", kind: "sharpen", delta: 5, from_level: 2, to_level: 3 },
    { id: "f2", skill: "Experimentation", kind: "add", delta: 6 },
    { id: "f3", skill: "Kubernetes", kind: "practice", delta: 0 },
  ],
  summary: "Product manager, 6 years in fintech — onboarding, billing, and growth.",
  roles: [
    {
      role_id: "experience:0", kind: "experience", title: "Product Manager", org: "Acme", dates: "2021 — Present",
      points: [
        { point_key: "p1", needs_impact: false, variants: [
          { id: "v1", text: "Led an onboarding revamp that cut activation time 40% across 12k users.",
            audience_tags: ["startup"], source: "migration", is_canonical: true }] },
        { point_key: "p3", needs_impact: false, variants: [
          { id: "v4", text: "Ran weekly growth experiments; shipped 3 that lifted retention 8%.",
            audience_tags: ["startup"], source: "migration", is_canonical: true }] },
      ],
    },
    {
      role_id: "experience:1", kind: "experience", title: "Analyst", org: "Beta", dates: "2019 — 2021",
      points: [
        { point_key: "p4", needs_impact: false, variants: [
          { id: "v7", text: "Built the revenue forecast model adopted by the finance team.",
            audience_tags: [], source: "migration", is_canonical: true }] },
      ],
    },
  ],
}
