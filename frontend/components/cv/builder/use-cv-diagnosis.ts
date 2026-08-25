/**
 * useCvDiagnosis — the CV is scanned ONCE per change, here, and every view of
 * that scan is derived from the one result.
 *
 * Before this, four call sites each ran their own full `runContentChecks` over
 * the same CV with the same inputs — `contentPenalty` and `buildV2Fixes` inside
 * usePlaygroundModel, `lineVerdicts` and `buildV2Fixes` again inside
 * WorkstationShell. Each was individually memoised, which is exactly why nobody
 * noticed: four correct memos over identical inputs still cost four scans.
 * Measured on a 30-bullet CV: 1.37ms per change, and the master surface
 * autosaves on every keystroke.
 *
 * The scanning entry points were removed rather than left beside this hook, so
 * a fifth accidental scan cannot be added without deleting a function argument.
 *
 * ── The invariant this hook exists to protect ──
 * Dismissing a fix hides its card; it must NEVER buy points. So the penalty is
 * computed from `allFindings` (everything the scan saw) while the rail reads
 * `fixes` / `issues` (dismissal-filtered). One scan, two audiences, and the two
 * can never drift apart because there is only one array underneath.
 */
"use client"

import { useMemo } from "react"
import type { CVStructured } from "@/lib/api"
import type { AtsCheck } from "./ats-checks"
import {
  contentPenalty,
  runContentChecks,
  type ContentFinding,
} from "./content-checks"
import { buildFixes, type V2Fix } from "./fix-model"
import { lineVerdicts, type LineVerdict } from "./cv-severity"
import {
  atsPassTally,
  buildIssues,
  triageCounts,
  type Issue,
  type TriageCounts,
} from "./issue-model"

export interface CvDiagnosis {
  /** Everything the scan saw, dismissals included. The score penalty reads THIS. */
  allFindings: readonly ContentFinding[]
  /** Deterministic point cost of the open findings. Never reduced by dismissal. */
  penalty: number
  /** Non-dismissed content fixes, worst-severity first. */
  fixes: V2Fix[]
  /** Per-line tone for the CV pane, keyed by editor iid. */
  verdicts: Map<string, LineVerdict>
  /** The single rail queue: content fixes + failing ATS + empty-section invites. */
  issues: Issue[]
  counts: TriageCounts
  atsPassed: number
  atsTotal: number
}

export interface CvDiagnosisInput {
  cv: CVStructured
  /** Lines dropped from this job's projection — excluded before any rule runs. */
  hidden: Set<string>
  atsChecks: AtsCheck[]
  /** Fix ids the user set aside. Hides cards; never moves the score. */
  dismissed?: Set<string>
  /** Empty sections only invite where this surface can actually fill them. */
  sectionInvites?: boolean
}

export function useCvDiagnosis({
  cv, hidden, atsChecks, dismissed, sectionInvites = true,
}: CvDiagnosisInput): CvDiagnosis {
  return useMemo(() => {
    const allFindings = runContentChecks(cv, hidden)
    const open = dismissed?.size
      ? allFindings.filter(f => !dismissed.has(f.id))
      : allFindings
    const fixes = buildFixes(cv, open)
    const issues = buildIssues({ cv, fixes, atsChecks, sectionInvites })
    const { passed, total } = atsPassTally(atsChecks)
    return {
      allFindings,
      penalty: contentPenalty(allFindings),
      fixes,
      verdicts: lineVerdicts(cv, hidden, allFindings, { dismissed }),
      issues,
      counts: triageCounts(issues),
      atsPassed: passed,
      atsTotal: total,
    }
  }, [cv, hidden, atsChecks, dismissed, sectionInvites])
}
