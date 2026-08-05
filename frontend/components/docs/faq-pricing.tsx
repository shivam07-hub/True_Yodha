const FREE_FEATURES = [
  "Your Myro Score",
  "Full 10-domain analysis",
  "Live job matches",
  "Skill practice",
  "Diary & CV versions",
]

const COIN_FEATURES = [
  "Deep per-job fit analysis",
  "Company intel & follows",
  "AI CV rewrite & restructure",
  "Refresh your matches",
]

export function FAQPricing() {
  return (
    <section className="docs-pricing" aria-labelledby="docs-pricing-title">
      <h3 id="docs-pricing-title">Free to start. Private by default.</h3>
      <div className="docs-pricing-card">
        <p className="docs-pricing-lede">
          Myro Coins meter a shared engine: contribute signal to earn them, draw intelligence
          to spend. Every contribution sharpens the matches everyone gets.
        </p>
        <div className="docs-pricing-grid">
          <FeatureList heading="Free, always" features={FREE_FEATURES} />
          <FeatureList heading="Uses Myro Coins" features={COIN_FEATURES} subdued />
        </div>
        <p className="docs-pricing-footnote">
          Start with 3,000 Myro Coins — about 2 months of normal use. Earn more as you practice;
          top up anytime.
        </p>
      </div>
    </section>
  )
}

function FeatureList({
  heading,
  features,
  subdued = false,
}: {
  heading: string
  features: string[]
  subdued?: boolean
}) {
  return (
    <div className={subdued ? "docs-pricing-column is-subdued" : "docs-pricing-column"}>
      <h4>{heading}</h4>
      <ul>{features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
    </div>
  )
}
