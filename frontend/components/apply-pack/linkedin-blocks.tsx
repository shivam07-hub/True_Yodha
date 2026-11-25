"use client"

/**
 * A delivered LinkedIn check: every section with Copy, in LinkedIn's order,
 * and a plain link to the person's own profile. Myro writes; they paste.
 */

import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { LinkedInBlocks as Blocks } from "@/lib/api"

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false)
  if (!text.trim()) return null
  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }
  return (
    <div className="li-block">
      <div className="li-block-head">
        <span className="li-block-label">{label}</span>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="li-block-text">{text}</p>
    </div>
  )
}

export function LinkedInBlocks({ blocks, profileUrl }: { blocks: Blocks; profileUrl: string | null }) {
  return (
    <div className="li-blocks">
      {profileUrl ? (
        <a className="tm-link li-open" href={profileUrl} target="_blank" rel="noopener noreferrer">
          Open your LinkedIn
        </a>
      ) : null}
      <CopyBlock label="Headline" text={blocks.headline} />
      <CopyBlock label="About" text={blocks.about} />
      {blocks.experience.map((role) => (
        <CopyBlock
          key={`${role.company}|${role.title}|${role.dates}`}
          label={[role.title, role.company, role.dates].filter(Boolean).join(" · ")}
          text={role.text}
        />
      ))}
      <CopyBlock label="Education" text={blocks.education.join("\n")} />
      <CopyBlock label="Top skills" text={blocks.skills.join(", ")} />
      <CopyBlock label="Featured" text={blocks.featured} />
      {blocks.delete.length > 0 ? (
        <div className="li-block">
          <span className="li-block-label">Delete these rows</span>
          <ul className="li-delete">
            {blocks.delete.map((row) => <li key={row}>{row}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
