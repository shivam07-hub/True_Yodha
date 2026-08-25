/**
 * fix-verify — did the rewrite actually do the thing the row promised?
 *
 * The rail row says `Cut "leverage"`. On 2026-08-25 that row was observed
 * returning the original sentence unchanged, with "leverage" still in it,
 * presented as "Stronger version" under the rationale "Highlights key revenue
 * figure". Two faults met: the fix's kind and its offending phrase were never
 * sent to the rewriter (fixed in rewrite-fetchers), and nothing on the way back
 * checked the result against the promise.
 *
 * This is the second half. It is deterministic and local — the same class of
 * check that raised the finding decides whether the finding is gone. A rewrite
 * that fails it is not a weaker variant to be offered anyway; it is a miss, and
 * saying so is cheaper for the user than a silent no-op they have to notice.
 */
import { hasQuantity } from "./content-checks"
import type { V2Fix } from "./fix-model"

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function containsPhrase(text: string, phrase: string): boolean {
  if (!phrase.trim()) return false
  return new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i").test(text)
}

/**
 * True when `candidate` no longer carries the defect `fix` named.
 *
 * Deliberately narrow: it asks only "is the named defect gone", never "is this
 * line better". Judging better is the model's job and the user's call; judging
 * whether the promised change happened is arithmetic, and arithmetic should not
 * be delegated to a language model.
 */
export function didFix(fix: V2Fix, candidate: string): boolean {
  const text = candidate.trim()
  if (!text) return false

  switch (fix.category) {
    case "unquantified":
      return hasQuantity(text)
    case "weak-verb": {
      // Only the FRONT matters — the check fires on the opener, so a line that
      // no longer leads with it is fixed even if the words survive mid-sentence.
      const stripped = text.replace(/^[\s•\-–*·]+/, "").toLowerCase()
      return !fix.offenders.some(o => stripped.startsWith(o.toLowerCase()))
    }
    case "buzzword":
    case "repetition":
      return !fix.offenders.some(o => containsPhrase(text, o))
    default:
      return true
  }
}

/** Variants that actually delivered, in the model's own order. Empty means the
 *  rewrite missed and the card must say so rather than offer a no-op. */
export function passingVariants<T extends { text: string }>(
  fix: V2Fix | null,
  variants: readonly T[],
): T[] {
  if (!fix) return [...variants]
  return variants.filter(v => didFix(fix, v.text))
}
