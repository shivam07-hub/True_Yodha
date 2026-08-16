/**
 * Screen 1's words and its CV chips — pure, so the copy and the dedupe can
 * be tested without mounting the modal.
 *
 * The chips are proof Myro read the CV, not a second form. Tapping one drops
 * the phrase into the pad as speech, not a comma-list. Near-duplicate titles
 * ("tech sales" / "IT Sales") collapse so the first screen does not advertise
 * that Myro cannot tell them apart.
 */

import { formatCount } from "@/lib/format"

/** IT / technical / information technology all read as "tech" for uniqueness. */
function starterKey(word: string): string {
  const t = word
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\binformation technology\b/g, "tech")
    .replace(/\btechnical\b/g, "tech")
    .replace(/\bit\b/g, "tech")
  return t.replace(/\s+/g, " ").trim()
}

export function uniqueStarters(words: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of words) {
    const word = raw.trim()
    const key = starterKey(word)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(word)
  }
  return out
}

/** Append a CV phrase as speech. Space, never a comma. Skip if already in the pad. */
export function appendStarter(current: string, word: string): string {
  const next = word.trim()
  if (!next) return current
  const existing = current.trim()
  if (!existing) return next
  if (existing.toLowerCase().includes(next.toLowerCase())) return existing
  return `${existing} ${next}`
}

export function remainingHint(length: number, cap?: number): string | null {
  if (cap == null || cap <= 0) return null
  if (length < cap * 0.8) return null
  return `${Math.max(0, cap - length)} left`
}

export function rolesWaitingCopy(count: number): { n: string; lede: string } | null {
  if (count <= 0) return null
  return {
    n: formatCount(count),
    lede: "roles landed since your last search. None of them are sorted yet.",
  }
}

export function cvReadCopy(cvReady: boolean, memoryCount: number): string | null {
  if (cvReady && memoryCount > 0) {
    return `I've read your CV and the ${formatCount(memoryCount)} things you've told me. I'm not guessing what matters until you say the work.`
  }
  if (cvReady) {
    return "I've read your CV. I'm not guessing what matters until you say the work."
  }
  if (memoryCount > 0) {
    return `You've told me ${formatCount(memoryCount)} things. Name the work and I'll use what fits.`
  }
  return null
}

export function searchCostCopy(runCost: number, balance: number): { text: string; short: boolean } {
  if (runCost === 0) return { text: "Free", short: false }
  if (balance < runCost) return { text: `Need ${runCost} · you have ${balance}`, short: true }
  return { text: `${runCost} Myro Coins`, short: false }
}
