"use client"

import Link from "next/link"
import { ChevronDown, ExternalLink, FilePlus2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { OnboardingResult } from "@/lib/api"

type Preview = Extract<OnboardingResult, { kind: "profile_preview" }>

interface Props { result: Preview; onBuild: () => void; onUpload: () => void }

export function ProfilePreview({ result, onBuild, onUpload }: Props) {
  const { target, preview } = result
  return (
    <section className="w-full max-w-3xl" aria-labelledby="preview-title">
      <p className="text-sm font-semibold text-[var(--tm-interactive)]">Profile Preview</p>
      <h1 id="preview-title" className="mt-2 text-balance text-3xl font-semibold tracking-normal text-[var(--tm-text)]">Myro understood your direction</h1>
      <div className="mt-5 flex flex-wrap gap-2 text-sm">
        {[target.role_title, target.seniority, target.location].filter(Boolean).map((item) => <span key={item} className="rounded border border-[var(--tm-border)] bg-[var(--tm-surface)] px-3 py-1.5 capitalize text-[var(--tm-text-muted)]">{item}</span>)}
      </div>

      <div className="mt-7 grid gap-5 md:grid-cols-[1fr_220px]">
        <div>
          <h2 className="text-base font-semibold text-[var(--tm-text)]">Evidence-backed skills</h2>
          <div className="mt-3 divide-y divide-[var(--tm-border-soft)] rounded-md border border-[var(--tm-border-soft)] bg-[var(--tm-surface)]">
            {preview.skills.map((skill) => (
              <details key={skill.taxonomy_key} className="group px-4 py-3">
                <summary className="tm-control-focus flex cursor-pointer list-none items-center justify-between rounded text-sm font-medium text-[var(--tm-text)]">
                  {skill.name}<ChevronDown className="size-4 text-[var(--tm-text-faint)] group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="mt-2 text-sm leading-6 text-[var(--tm-text-muted)]">{skill.evidence || "Detected from your description."}</p>
              </details>
            ))}
          </div>
        </div>
        <aside className="rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] p-4">
          <p className="text-sm font-medium text-[var(--tm-text-muted)]">Early estimate</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--tm-text)]">{preview.estimate_min}-{preview.estimate_max}</p>
          <p className="mt-2 text-sm leading-5 text-[var(--tm-text-muted)]">Incomplete until Myro reads a full CV.</p>
        </aside>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <Button size="lg" onClick={onBuild}><FilePlus2 className="size-5" />Build my starter CV</Button>
        <Button size="lg" variant="outline" onClick={onUpload}><Upload className="size-5" />Upload an existing CV</Button>
      </div>
      <Link href="/market" target="_blank" rel="opener" className="tm-control-focus mx-auto mt-5 flex w-fit items-center gap-1 rounded px-3 py-2 text-sm text-[var(--tm-text-muted)] underline-offset-4 hover:underline">
        Browse jobs instead <ExternalLink className="size-3.5" aria-hidden="true" />
      </Link>
    </section>
  )
}
