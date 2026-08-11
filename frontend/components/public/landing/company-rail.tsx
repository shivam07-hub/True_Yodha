import { formatCount } from "@/lib/format"

interface LandingCompanyRailProps {
  companyNames: string[]
  companiesMonitored: number
}

export function LandingCompanyRail({
  companyNames,
  companiesMonitored,
}: LandingCompanyRailProps) {
  const visibleNames = companyNames.slice(0, 12)

  return (
    <section className="lp-company-rail" aria-label="Company career pages tracked by Myro">
      <p>
        Read live from <strong>{formatCount(companiesMonitored)}+ company career pages</strong>
      </p>
      <div className="lp-company-rail-scroll">
        {visibleNames.length ? visibleNames.map((name) => (
          <span className="lp-company-chip" key={name}>
            <span aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
            {name}
          </span>
        )) : Array.from({ length: 7 }, (_, index) => (
          <span className="lp-company-chip-skeleton" key={index} aria-hidden="true" />
        ))}
      </div>
    </section>
  )
}
