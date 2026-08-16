"use client"

import { useState } from "react"
import { PlaygroundHeader } from "@/components/cv/builder/playground-header"
import { FirstRunCvPane } from "@/components/onboarding/first-run-cv-pane"
import {
  FirstRunSkillReview,
  type FirstRunSkillReviewProps,
} from "@/components/onboarding/first-run-skill-review"

import "@/app/(authed)/cv/cv-builder.css"
import "@/app/(authed)/cv/playground-v2.css"

type Pane = "edit" | "skills"

/**
 * Step 1 of onboarding, shown as the CV playground: the parsed CV on the left,
 * the same skill confirmation on the right. Stays on /onboarding/result — the
 * /cv?edit=1 redirect already blanked first-run users when layout lagged.
 */
export function FirstRunPlayground(props: Omit<FirstRunSkillReviewProps, "children">) {
  const [pane, setPane] = useState<Pane>("skills")

  return (
    <FirstRunSkillReview {...props}>
      {(chrome, list) => (
        <div className="cvb-v2" data-tab={pane}>
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
            hideBack={!props.onForward}
            backLabel="Back to my shortlist"
            statusValue={chrome.keptCount}
            scoreCaption={chrome.removedCount > 0 ? `kept · ${chrome.removedCount} removed` : "kept"}
            primaryLabel={chrome.busy ? "Saving…" : chrome.keptCount < 1 ? "Keep at least one" : "Looks right →"}
            canApply={chrome.keptCount >= 1 && !chrome.busy}
            applyHint={chrome.keptCount < 1 ? "Keep at least one skill" : "Confirm these skills"}
            onBack={props.onForward ?? (() => {})}
            onReqPill={() => {}}
            onApply={chrome.confirm}
            onDownload={() => {}}
          />
          {chrome.error ? (
            <p role="alert" className="cvb-pgc-err mx-5">{chrome.error}</p>
          ) : null}
          <div className="cvb-v2-main">
            <FirstRunCvPane token={props.token} />
            {list}
          </div>
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
        </div>
      )}
    </FirstRunSkillReview>
  )
}
