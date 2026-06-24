/**
 * Experience Reservoir (v2) — frontend data contract + a design fixture.
 *
 * Shaped like the future `GET /cv/reservoir` endpoint: the user's `cv_points`
 * rows GROUPED into roles → points → phrasing-variants (canonical first). This is
 * richer than render_master's output (which only emits the canonical CV) because
 * the inventory has to show the variant stacks the user curates.
 *
 * Phase 1 is SHADOW — no endpoint yet. The view binds to this fixture so the design
 * is buildable and reviewable now; swapping to the live endpoint later only changes
 * the data source, not the component. Types move to lib/api.ts when the route lands.
 *
 * Spec: memory/project_cv_experience_reservoir.md (GRILL-LOCKED 2026-06-24).
 */

// The contract now lives in lib/api.ts (the live GET /cv/reservoir shape); re-exported
// here so existing importers (reservoir-view) keep a single import site.
import type {
  PointSource,
  ReservoirView,
} from "@/lib/api"
export type {
  PointSource,
  PointVariant,
  ReservoirPoint,
  ReservoirRole,
  ReservoirView,
} from "@/lib/api"

// Human-readable provenance shown on a non-migration variant.
export const SOURCE_LABEL: Record<PointSource, string | null> = {
  migration: null,
  gap_session: "from a gap fix",
  forge: "via practice",
  manual: "you added",
  restructure: "from a rewrite",
}

export const RESERVOIR_FIXTURE: ReservoirView = {
  summary: "Product manager, 6 years in fintech — onboarding, billing, and growth.",
  roles: [
    {
      role_id: "r-acme-pm",
      kind: "experience",
      title: "Product Manager",
      org: "Acme",
      dates: "2021 — Present",
      points: [
        {
          point_key: "p1",
          needs_impact: false,
          variants: [
            { id: "v1", text: "Led an onboarding revamp that cut activation time 40% across 12k new users.",
              audience_tags: ["startup"], source: "migration", is_canonical: true },
            { id: "v2", text: "Drove a cross-functional onboarding overhaul, improving first-week activation by 40%.",
              audience_tags: ["consulting"], source: "gap_session", is_canonical: false },
          ],
        },
        {
          point_key: "p2",
          needs_impact: true,
          variants: [
            { id: "v3", text: "Owned the billing v2 migration end to end.",
              audience_tags: [], source: "migration", is_canonical: true },
          ],
        },
        {
          point_key: "p3",
          needs_impact: false,
          variants: [
            { id: "v4", text: "Ran weekly growth experiments; shipped 3 that lifted retention 8%.",
              audience_tags: ["startup"], source: "migration", is_canonical: true },
            { id: "v5", text: "Designed and led an A/B experimentation cadence, raising 30-day retention 8%.",
              audience_tags: ["consulting"], source: "forge", is_canonical: false },
            { id: "v6", text: "Established a growth experiment practice that improved retention 8%.",
              audience_tags: ["leadership"], source: "manual", is_canonical: false },
          ],
        },
      ],
    },
    {
      role_id: "r-beta-analyst",
      kind: "experience",
      title: "Analyst",
      org: "Beta",
      dates: "2019 — 2021",
      points: [
        {
          point_key: "p4",
          needs_impact: false,
          variants: [
            { id: "v7", text: "Built the revenue forecast model adopted by the finance team.",
              audience_tags: [], source: "migration", is_canonical: true },
          ],
        },
      ],
    },
    {
      role_id: "r-cli",
      kind: "project",
      title: "Open-source CLI",
      org: null,
      dates: "2020",
      points: [
        {
          point_key: "p5",
          needs_impact: true,
          variants: [
            { id: "v8", text: "Authored the plugin system.",
              audience_tags: [], source: "migration", is_canonical: true },
          ],
        },
      ],
    },
  ],
  skills_line: "Product strategy, SQL, Experimentation, Roadmapping, Stakeholder management",
  certs: ["Pragmatic Institute — PMC-III", "AWS Cloud Practitioner"],
}
