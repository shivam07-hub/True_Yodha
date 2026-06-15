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
    <ol style={{ listStyle: "none", counterReset: "ladder", margin: "32px 0", padding: 0 }}>
      {steps.map((step, i) => (
        <li
          key={i}
          style={{
            position: "relative", paddingLeft: 52, marginBottom: 20,
            minHeight: 36,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: "absolute", left: 0, top: 0,
              width: 36, height: 36, borderRadius: "50%",
              background: "var(--tm-int-bg-wash)", border: "1px solid var(--tm-int-border)",
              color: "var(--tm-interactive)", fontSize: 14, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {i + 1}
          </span>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--tm-text)", lineHeight: 1.4, marginBottom: 4 }}>
            {step.name}
          </div>
          <p style={{ fontSize: 15, color: "var(--tm-text-muted)", lineHeight: 1.65, margin: 0 }}>
            {step.text}
          </p>
        </li>
      ))}
    </ol>
  )
}
