import type { ReactNode } from "react"

interface MethodologyBlockProps {
  children: ReactNode
}

export function MethodologyBlock({ children }: MethodologyBlockProps) {
  // `methodology-block` keeps its inner-element styling (globals.css);
  // `nl-note` carries the shared quiet-footnote frame.
  return (
    <div className="methodology-block nl-fig nl-note">
      {children}
    </div>
  )
}
