import type { ReactNode } from "react"

interface MethodologyBlockProps {
  children: ReactNode
}

export function MethodologyBlock({ children }: MethodologyBlockProps) {
  return (
    <div
      className="methodology-block"
      style={{
        background: "var(--tm-surface)",
        border: "1px solid var(--tm-border-soft)",
        borderRadius: "var(--tm-radius)",
        padding: "20px 24px",
        fontSize: 13,
        lineHeight: 1.65,
        color: "var(--tm-text-faint)",
        margin: "40px 0",
      }}
    >
      {children}
    </div>
  )
}
