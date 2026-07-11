import type { CompanySkillIntelligence } from "@/lib/api"


const TREND_LABEL = {
  emerging: "Emerging",
  steady: "Steady",
  declining: "Declining",
  dormant: "Dormant",
} as const

export function CompanySkillIntelligenceCard({
  companyName,
  data,
}: {
  companyName: string
  data: CompanySkillIntelligence | null
}) {
  if (!data?.skills.length) return null
  const skills = data.skills.slice(0, 8)

  return (
    <section
      aria-labelledby="company-skill-intelligence-title"
      className="mb-8 rounded-xl border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-[var(--tm-interactive)]">
            Company skill intelligence
          </p>
          <h2
            id="company-skill-intelligence-title"
            className="text-balance text-lg font-semibold text-[var(--tm-text)]"
          >
            What skills is {companyName} hiring for?
          </h2>
        </div>
        {data.as_of ? (
          <time className="text-xs tabular-nums text-[var(--tm-text-faint)]" dateTime={data.as_of}>
            Through {data.as_of.slice(0, 10)}
          </time>
        ) : null}
      </div>

      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {skills.map(skill => (
          <li
            key={skill.skill_id}
            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--tm-border-soft)] px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--tm-text)]">{skill.display_name}</p>
              <p className="text-xs text-[var(--tm-text-faint)]">{TREND_LABEL[skill.trend_signal]}</p>
            </div>
            <div className="shrink-0 text-right tabular-nums">
              <p className="text-sm font-semibold text-[var(--tm-text)]">{skill.current_job_count}</p>
              {skill.avg_required_level != null ? (
                <p className="text-xs text-[var(--tm-text-faint)]">L{skill.avg_required_level.toFixed(1)}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {data.newsletter_summary.emerging_skills.length ? (
        <p className="mt-4 text-pretty text-sm text-[var(--tm-text-faint)]">
          Rising demand: {data.newsletter_summary.emerging_skills.join(", ")}.
        </p>
      ) : null}
    </section>
  )
}
