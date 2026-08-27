"use client"

import { useState } from "react"
import { PlaygroundHeader } from "@/components/cv/builder/playground-header"
import { FirstRunCvPane } from "@/components/onboarding/first-run-cv-pane"
import {
  FirstRunSkillReview,
  type FirstRunSkillReviewProps,
} from "@/components/onboarding/first-run-skill-review"
import { StickyOnboardingActionBar } from "@/components/onboarding/sticky-action-bar"
import { Button } from "@/components/ui/button"

import "@/app/(authed)/cv/cv-builder.css"
import "@/app/(authed)/cv/playground-v2.css"

type Pane = "edit" | "skills"

/**
 * Step 1 of onboarding, shown as the CV playground: the parsed CV on the left,
 * the same skill confirmation on the right. Stays on /onboarding/result — the
 * /cv?edit=1 redirect already blanked first-run users when layout lagged.
 *
 * The playground header only names the step. Confirm stays in the onboarding
 * sticky bar, the same place Direction uses.
 */
export function FirstRunPlayground(props: Omit<FirstRunSkillReviewProps, "children">) {
  const [pane, setPane] = useState<Pane>("skills")

  return (
    <FirstRunSkillReview {...props}>
      {(chrome, list) => (
        <div className="cvb-v2 cvb-v2--onboarding" data-tab={pane}>
          <h1 className="sr-only">Check what Myro found</h1>
          <PlaygroundHeader
            variant="master"
            brandLabel="Myro"
            masterMeta="Your CV · 1 of 2"
            jobTitle=""
            company="Untitled company"
            reqCount={0}
            ready={0}
            delta={0}
            saveState=""
            hideOverflow
            hideScore
            hideApply
            hideBack={!props.onForward}
            backLabel="Back to my shortlist"
            primaryLabel=""
            canApply={false}
            applyHint=""
            onBack={props.onForward ?? (() => {})}
            onReqPill={() => {}}
            onApply={() => {}}
            onDownload={() => {}}
          />
          <div className="cvb-v2-main">
            <FirstRunCvPane token={props.token} />
            {list}
          </div>
          <StickyOnboardingActionBar
            error={chrome.error}
            contentClassName="max-w-5xl"
            above={
              <nav className="cvb-v2-bottomnav" aria-label="Onboarding sections">
                <button
                  type="button"
                  className={`cvb-v2-tabbtn${pane === "edit" ? " active" : ""}`}
                  onClick={() => setPane("edit")}
                >
                  CV
                </button>
                <button
                  type="button"
                  className={`cvb-v2-tabbtn${pane === "skills" ? " active" : ""}`}
                  onClick={() => setPane("skills")}
                >
                  Skills
                </button>
              </nav>
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-3 sm:px-8">
              <p className="text-sm text-[var(--tm-text-muted)]">
                <span className="font-semibold tabular-nums text-[var(--tm-text)]">{chrome.keptCount}</span> kept
                {chrome.removedCount > 0 && <span className="tabular-nums"> · {chrome.removedCount} removed</span>}
              </p>
              <div className="flex flex-1 items-center gap-2 sm:flex-none">
                {props.onForward && (
                  <Button variant="ghost" size="lg" className="min-h-12" onClick={props.onForward}>
                    Back to my shortlist
                  </Button>
                )}
                <Button
                  size="lg"
                  className="min-h-12 flex-1 sm:flex-none"
                  disabled={chrome.busy || chrome.keptCount < 1}
                  onClick={chrome.confirm}
                >
                  {chrome.busy ? "Saving…" : chrome.keptCount < 1 ? "Keep at least one" : "Looks right →"}
                </Button>
              </div>
            </div>
          </StickyOnboardingActionBar>
        </div>
      )}
    </FirstRunSkillReview>
  )
}
