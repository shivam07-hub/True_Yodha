/**
 * WorkstationShell — the CV workstation, once, for all three surfaces.
 *
 * PublicPlayground, MasterWorkspace and PlaygroundView each hand-rolled the
 * same shell before this: their own toolbar, their own rail tabs, their own
 * zero state. They drifted (the anon rail had a read-only ATS tab; the master
 * rail had no ATS at all), and the hierarchy redesign would have had to be
 * applied three times and kept in sync forever.
 *
 * The shell owns the layout and the triage state — which line is open, which
 * severity is filtered, which rail lane is showing. Each surface supplies only
 * what is genuinely different: its header, its writes, its rewrite endpoint,
 * its second rail lane, and its terminal card.
 */
"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import type { CVStructured, UserSkillsByDomain } from "@/lib/api"
import type { PageFill } from "@/lib/cv/page-fill"
import type { AtsCheck } from "./ats-checks"
import type { IdentityLines } from "./cv-identity-card"
import type { RewriteFetcher } from "./use-line-rewrite"
import { CvDocument } from "./cv-document"
import { CvLineRewrite } from "./cv-line-rewrite"
import { CvPaneToolbar } from "./cv-pane-toolbar"
import { CvDoNowBar, CvSeverityChips } from "./cv-mobile-triage"
import { WorkstationRail } from "./workstation-rail"
import { buildV2Fixes, type V2Fix } from "./fix-model"
import { lineVerdicts, type Severity } from "./cv-severity"
import { atsPassTally, buildIssues, triageCounts, type Issue } from "./issue-model"

export interface WorkstationShellProps {
  header: ReactNode
  cv: CVStructured
  identity: IdentityLines
  hidden: Set<string>
  /** A job is in play, so a green line can honestly say "on target". */
  targeted: boolean
  atsChecks: AtsCheck[]
  pageFill: PageFill
  lineCount: number
  wordCount: number
  /** The print rendering of the same document, shown under SHEET. */
  sheet: ReactNode
  /** null ⇒ this surface has no second lane (logged out). */
  skillsLabel: string | null
  skillsPane?: ReactNode
  railFooter?: ReactNode
  /** Shown when the queue is clear and there is no Skills lane. */
  terminal?: ReactNode
  railLabel: string
  /** Fix ids the user dismissed — filtered out of the queue and the pane. */
  dismissed?: Set<string>
  /** Where the rewrite request goes. Differs authed / anon. */
  makeFetcher: (bullet: string, quantifyOnly: boolean) => RewriteFetcher
  applying?: boolean
  onApplyRewrite: (args: { fix: V2Fix | null; oldText: string; newText: string }) => void
  onEditLine: (oldText: string, newText: string) => void
  onCopyLine?: (text: string) => void
  onToggleHidden?: (iid: string) => void
  onPatch?: (mut: (draft: CVStructured) => CVStructured) => void
  identityEditable?: boolean
  onAddBullet?: (roleIndex: number, text: string) => void
  /** ATS-extracted skills, for the rank-4 chip line under each bullet. */
  userSkills?: UserSkillsByDomain | null
  /** Deep-link entry: `?tab=skills` lands on the Skills lane. */
  initialRailTab?: "fixes" | "skills"
  /** A header control asking for a lane. Bump `n` to re-request the same one. */
  requestRailTab?: { tab: "fixes" | "skills"; n: number } | null
  /** Deep-link entry: `?mentor=1&skill=…` resolves to one CV line and opens its
   *  rewrite. A new value re-opens; null leaves the user's own choice alone. */
  requestOpenIid?: string | null
  className?: string
}

export function WorkstationShell(props: WorkstationShellProps) {
  const {
    header, cv, identity, hidden, targeted, atsChecks, pageFill, lineCount,
    wordCount, sheet, skillsLabel, skillsPane, railFooter, terminal, railLabel,
    dismissed, makeFetcher, applying, onApplyRewrite, onEditLine, onCopyLine,
    onToggleHidden, onPatch, identityEditable, onAddBullet, userSkills,
    initialRailTab, requestRailTab, requestOpenIid, className,
  } = props

  const [mode, setMode] = useState<"edit" | "sheet">("edit")
  const [railTab, setRailTab] = useState<"fixes" | "skills">(initialRailTab ?? "fixes")
  const [filter, setFilter] = useState<Severity | null>(null)
  const [openIid, setOpenIid] = useState<string | null>(null)
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ iid: string; n: number } | null>(null)
  const [fixedCount, setFixedCount] = useState(0)

  const verdicts = useMemo(
    () => lineVerdicts(cv, hidden, { dismissed }),
    [cv, hidden, dismissed],
  )
  const fixes = useMemo(
    () => buildV2Fixes(cv, hidden).filter(f => !dismissed?.has(f.id)),
    [cv, hidden, dismissed],
  )
  const issues = useMemo(
    () => buildIssues({ cv, fixes, atsChecks, sectionInvites: !!onPatch }),
    [cv, fixes, atsChecks, onPatch],
  )
  const counts = useMemo(() => triageCounts(issues), [issues])
  const { passed: atsPassed } = useMemo(() => atsPassTally(atsChecks), [atsChecks])
  const openFix = openIid ? fixes.find(f => f.iid === openIid) ?? null : null

  function jump(iid: string) {
    setFlash(prev => ({ iid, n: (prev?.n ?? 0) + 1 }))
  }

  useEffect(() => {
    if (requestRailTab) setRailTab(requestRailTab.tab)
  }, [requestRailTab])

  // A deep link names one line. Open and jump to it once, then leave the user's
  // own choices alone — re-applying on every render would trap them on that row.
  useEffect(() => {
    if (!requestOpenIid) return
    setMode("edit")
    setOpenIid(requestOpenIid)
    setFlash(prev => ({ iid: requestOpenIid, n: (prev?.n ?? 0) + 1 }))
  }, [requestOpenIid])
  function openIssue(issue: Issue) {
    setActiveIssueId(issue.id)
    setMode("edit")
    if (issue.fix) {
      setOpenIid(issue.fix.iid)
      jump(issue.fix.iid)
      return
    }
    setOpenIid(null)
    if (issue.target) {
      document.getElementById(`cvw-sec-${issue.target}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }
  function openLine(iid: string) {
    setOpenIid(prev => (prev === iid ? null : iid))
    const match = fixes.find(f => f.iid === iid)
    setActiveIssueId(match?.id ?? null)
  }

  const next = issues[0]
  const nextLabel = next?.fix ? "Fix this line" : next?.action === "Add" ? "Add it" : "Open it"

  return (
    <div className={`cvb-v2${className ? ` ${className}` : ""}`} data-tab={mode}>
      {header}
      <CvSeverityChips counts={counts} filter={filter} onFilter={setFilter} />

      <div className="cvb-v2-main">
        <section className="cvb-v2-editor" aria-label="Your CV">
          <CvPaneToolbar
            mode={mode}
            onMode={setMode}
            pageFill={pageFill}
            lineCount={lineCount}
            wordCount={wordCount}
          />
          <div className="cvb-v2-editorbody">
            {mode === "sheet" ? sheet : (
              <CvDocument
                cv={cv}
                identity={identity}
                hidden={hidden}
                verdicts={verdicts}
                targeted={targeted}
                openIid={openIid}
                flash={flash}
                onOpenFix={openLine}
                onToggleHidden={onToggleHidden}
                onEditLine={onEditLine}
                onCopyLine={onCopyLine}
                onPatch={onPatch}
                identityEditable={identityEditable}
                onAddBullet={onAddBullet}
                userSkills={userSkills}
                renderRewrite={(iid, text) => (
                  <CvLineRewrite
                    key={iid}
                    fetcher={makeFetcher(text, openFix?.kind === "Quantify")}
                    applying={applying}
                    quantifyOnly={openFix?.kind === "Quantify"}
                    onApply={newText => {
                      onApplyRewrite({ fix: openFix ?? null, oldText: text, newText })
                      setFixedCount(n => n + 1)
                      setOpenIid(null)
                      setActiveIssueId(null)
                    }}
                    onDiscard={() => { setOpenIid(null); setActiveIssueId(null) }}
                  />
                )}
              />
            )}
          </div>
        </section>

        <WorkstationRail
          ariaLabel={railLabel}
          tab={railTab}
          onTab={setRailTab}
          skillsLabel={skillsLabel}
          skillsPane={skillsPane}
          issues={issues}
          counts={counts}
          filter={filter}
          onFilter={setFilter}
          activeIssueId={activeIssueId}
          onOpenIssue={openIssue}
          atsChecks={atsChecks}
          atsPassed={atsPassed}
          fixedCount={fixedCount}
          terminal={terminal}
          footer={railFooter}
        />
      </div>

      {next && mode === "edit" && (
        <CvDoNowBar
          title={next.title}
          index={1}
          total={issues.length}
          ctaLabel={nextLabel}
          onCta={() => openIssue(next)}
        />
      )}
    </div>
  )
}
