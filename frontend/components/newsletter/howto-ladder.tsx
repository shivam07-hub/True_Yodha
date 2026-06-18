import type { IssueStep } from "@/lib/newsletter"

interface HowToLadderProps {
  steps: IssueStep[]
}

/**
 * Visible numbered step ladder for Career-Trajectory issues. The on-page
 * source for the HowTo JSON-LD (emitted from the same `steps` in the page).
 */
export function HowToLadder({ steps }: HowToLadderProps) {
  if (!steps?.length) return null
  return (
    <ol className="nl-ladder">
      {steps.map((step, i) => (
        <li key={i}>
          <span aria-hidden="true" className="nl-ladder-i">{i + 1}</span>
          <div className="nl-ladder-name">{step.name}</div>
          <p className="nl-ladder-text">{step.text}</p>
        </li>
      ))}
    </ol>
  )
}
