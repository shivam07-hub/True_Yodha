/**
 * autofill — the deterministic heart of Career Profile ATS auto-fill (P2, S3).
 *
 * Pure + DOM-agnostic so it unit-tests without a browser. Two pieces:
 *   FIELD_DICTIONARY — per-fact label patterns (the deterministic matcher that
 *     covers the ATS majority: Workday / Greenhouse / Lever / Oracle HCM / Naukri
 *     + generic). Grill lock L6: dictionary first, LLM fallback for the unmatched.
 *   planFill(profile, fields) — given the CareerProfile and a list of detected
 *     form fields (each { id, label, type }), returns fill instructions:
 *       [{ id, value, fact, confidence }]
 *     The caller writes value into the field, highlights it, and lets the user
 *     review/edit before submit. NEVER auto-submits (lock L7).
 *
 * A field is matched to at most one fact (highest-priority pattern wins), and a
 * fact fills at most one field (the best-scoring match) so we never scatter the
 * same CTC across two inputs.
 */

// Each fact: how to render its value into a form + the label patterns that mean
// "this field wants that fact". Order = priority (earlier wins ties).
export const FIELD_DICTIONARY = [
  {
    fact: "notice_period_days",
    patterns: [/notice\s*period/i, /days?\s*to\s*join/i, /availability\s*to\s*join/i, /joining\s*time/i, /when\s*can\s*you\s*join/i],
    render: (v) => String(v),
  },
  {
    fact: "current_ctc_fixed_lpa",
    patterns: [/current\s*(annual\s*)?(ctc|salary|compensation)/i, /present\s*ctc/i, /current\s*fixed/i, /\bcurrent\s*pay\b/i],
    render: (v) => String(v),
  },
  {
    fact: "expected_ctc_lpa",
    patterns: [/expected\s*(annual\s*)?(ctc|salary|compensation)/i, /expected\s*fixed/i, /desired\s*salary/i, /salary\s*expectation/i],
    render: (v) => String(v),
  },
  {
    fact: "interview_availability",
    patterns: [/interview\s*availability/i, /available\s*(slots|for\s*interview)/i, /preferred\s*(interview\s*)?time/i],
    render: (v) => String(v),
  },
  {
    fact: "current_location",
    patterns: [/current\s*(city|location)/i, /\bcity\b/i, /present\s*location/i, /where\s*are\s*you\s*(currently\s*)?based/i],
    render: (v) => String(v),
  },
  {
    fact: "total_experience_years",
    patterns: [/total\s*(work\s*)?experience/i, /years?\s*of\s*experience/i, /\bexperience\s*\(years?\)/i],
    render: (v) => String(v),
  },
  {
    fact: "reporting_manager",
    patterns: [/reporting\s*manager/i, /current\s*manager/i, /supervisor\s*name/i],
    render: (v) => String(v),
  },
  {
    fact: "reason_for_change",
    patterns: [/reason\s*for\s*(change|leaving|job\s*change)/i, /why\s*(are\s*you\s*)?looking/i],
    render: (v) => String(v),
  },
]

const _SPEC_BY_FACT = Object.fromEntries(FIELD_DICTIONARY.map((s) => [s.fact, s]))

/** Best-matching fact for one field's label text, or null. Priority = list
 *  order (earlier dictionary entries win). Longer pattern hits rank first so a
 *  specific label ("expected ctc") beats a generic one ("ctc"). */
export function matchFact(labelText) {
  const label = String(labelText || "").trim()
  if (!label) return null
  for (const spec of FIELD_DICTIONARY) {
    for (const pat of spec.patterns) {
      if (pat.test(label)) return spec.fact
    }
  }
  return null
}

/**
 * Build the fill plan.
 * @param {object} profile - CareerProfileData (numeric/string keys).
 * @param {Array<{id:string,label:string,type?:string}>} fields - detected form fields.
 * @returns {{ fills: Array<{id,value,fact}>, unmatched: Array<{id,label}> }}
 *   `fills` = fields we can fill from the dictionary; `unmatched` = fields with
 *   a label but no dictionary hit (candidates for the LLM fallback, S3.2).
 */
export function planFill(profile, fields) {
  const fills = []
  const unmatched = []
  const usedFacts = new Set()

  for (const field of fields || []) {
    const fact = matchFact(field.label)
    if (!fact) {
      if (String(field.label || "").trim()) unmatched.push({ id: field.id, label: field.label })
      continue
    }
    const value = profile?.[fact]
    // Fact unknown to us, or already placed in an earlier field → skip.
    if (value === null || value === undefined || value === "" || usedFacts.has(fact)) continue
    usedFacts.add(fact)
    fills.push({ id: field.id, fact, value: _SPEC_BY_FACT[fact].render(value) })
  }
  return { fills, unmatched }
}
