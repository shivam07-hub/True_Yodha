"use client"

interface TailoredContextBarProps {
  company: string
  jobTitle: string
  onSwitchToMain: () => void
}

export function TailoredContextBar({ company, jobTitle, onSwitchToMain }: TailoredContextBarProps) {
  return (
    <div className="tm-lib-tailored-bar">
      <div className="tm-lib-tailored-left">
        <span className="tm-lib-tailored-eyebrow">Tailored for</span>
        <span className="tm-lib-tailored-pill">
          <span className="tm-lib-tailored-pill-co">{company || "Untitled company"}</span>
          <span className="tm-lib-tailored-pill-role">{jobTitle}</span>
        </span>
        <span className="tm-lib-tailored-eyebrow">·</span>
        <button type="button" className="tm-lib-tailored-switch" onClick={onSwitchToMain}>
          Switch to Main CV
        </button>
      </div>
    </div>
  )
}
