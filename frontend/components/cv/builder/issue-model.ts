/**
 * issue-model — the ONE queue the workstation rail renders.
 *
 * Before the hierarchy redesign the rail had two tabs that were the same kind
 * of thing: "Fixes" (content-quality cards, actionable) and "ATS" (a read-only
 * pass/fail grid). A user with an empty summary saw a red ✗ they could not act
 * on, in a tab they had to go find. Handoff §4.4 collapses them: ATS rows live
 * in the same list, carry an `ats · <tag>` provenance, and are actionable.
 *
 * Three sources, one shape:
 *   line    — a content-quality fix anchored to a CV bullet (fix-model)
 *   ats     — a FAILING machine-readability check (ats-checks)
 *   section — an empty section the CV pane is already showing as a dashed
 *             placeholder, so the rail and the paper agree on what is missing
 *
 * Passing ATS checks never enter the queue — they collapse into the rail's
 * single green strip (§4.5). A queue that lists what is already fine is how the
 * old ATS tab buried the two rows that mattered under eight that did not.
 */
import type { CVStructured } from "@/lib/api"
import type { AtsCheck, AtsFixTarget } from "./ats-checks"
import type { V2Fix } from "./fix-model"
import { SEVERITY_ORDER, atsSeverity, type Severity } from "./cv-severity"

export type IssueKind = "line" | "ats" | "section"
/** Where a non-line issue lands in the CV pane. Widens the ATS targets with the
 *  two master-owned sections the pane can also render empty. */
export type IssueTarget = AtsFixTarget | "education" | "certs"

export interface Issue {
  id: string
  kind: IssueKind
  severity: Severity
  /** Rank 3 — 12.5/600. Says the defect, never the remedy. */
  title: string
  /** Rank 4 — 9.5 mono uppercase. Says where it came from. */
  provenance: string
  /** Set for `line` issues: the host bullet + its rewrite payload. */
  fix: V2Fix | null
  /** Set for `ats` / `section` issues: the pane section to open. */
  target: IssueTarget | null
  /** Action word on a non-line row. `null` on line rows — those say
   *  "open on the line →" when active and nothing when not. */
  action: "Fix" | "Add" | null
}

interface BuildIssuesInput {
  cv: CVStructured
  /** Content-quality fixes, already dismissal-filtered by the caller. */
  fixes: V2Fix[]
  /** Full ATS run — passing rows are filtered out here, not by the caller,
   *  so the green strip and the queue can never disagree on the count. */
  atsChecks: AtsCheck[]
  /** Master-owned sections are only invitable where they are editable. */
  sectionInvites?: boolean
}

const KIND_ORDER: Record<IssueKind, number> = { line: 0, ats: 1, section: 2 }
const SEVERITY_RANK: Record<Severity, number> = { blocking: 0, weak: 1, optional: 2 }

export function buildIssues({
  cv, fixes, atsChecks, sectionInvites = true,
}: BuildIssuesInput): Issue[] {
  const issues: Issue[] = fixes.map(f => ({
    id: f.id,
    kind: "line" as const,
    severity: f.severity,
    title: f.title,
    provenance: f.provenance,
    fix: f,
    target: null,
    action: null,
  }))

  for (const c of atsChecks) {
    if (c.pass) continue
    issues.push({
      id: `ats:${c.tag}:${c.label}`,
      kind: "ats",
      severity: atsSeverity(c),
      title: c.detail ?? c.label,
      provenance: `ats · ${c.tag}`,
      fix: null,
      target: c.fix ?? null,
      action: c.optional ? "Add" : "Fix",
    })
  }

  if (sectionInvites) {
    if (!cv.skills_line?.trim()) {
      issues.push(invite("skills", "Add a skills line", "skills"))
    }
    if (cv.education.length === 0) {
      issues.push(invite("education", "Add an education section", "education"))
    }
    if (cv.certs.length === 0) {
      issues.push(invite("certs", "Add a certification section", "certs"))
    }
  }

  return issues.sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    || (b.fix?.gain ?? 0) - (a.fix?.gain ?? 0))
}

function invite(id: string, title: string, target: IssueTarget): Issue {
  return {
    id: `section:${id}`,
    kind: "section",
    severity: "optional",
    title,
    provenance: "optional",
    fix: null,
    target,
    action: "Add",
  }
}

export type TriageCounts = Record<Severity, number>

export function triageCounts(issues: readonly Issue[]): TriageCounts {
  const counts: TriageCounts = { blocking: 0, weak: 0, optional: 0 }
  for (const i of issues) counts[i.severity] += 1
  return counts
}

/** Required checks only — an optional miss is a nudge, never a failed check,
 *  so it must not drag the "N checks pass" strip. Mirrors atsScore. */
export function atsPassTally(checks: readonly AtsCheck[]): { passed: number; total: number } {
  const counted = checks.filter(c => !c.optional)
  return { passed: counted.filter(c => c.pass).length, total: counted.length }
}

export { SEVERITY_ORDER }
