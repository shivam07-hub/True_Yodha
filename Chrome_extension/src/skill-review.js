const CATEGORY_RANK = {
  emergingSkills: 1,
  secondarySkills: 2,
  primarySkills: 3,
}

function cleanLabel(value) {
  return String(value || "").trim()
}

function labelFromSuggestion(suggestion) {
  if (!suggestion) return ""
  return cleanLabel(suggestion.taxonomy_key || suggestion.label)
}

function normalizeLabel(label) {
  return cleanLabel(label).toLowerCase()
}

function addSkill(map, order, category, label) {
  const cleaned = cleanLabel(label)
  const key = normalizeLabel(cleaned)
  if (!key) return

  const existing = map.get(key)
  if (!existing) {
    map.set(key, { category, label: cleaned })
    order.push(key)
    return
  }

  if (CATEGORY_RANK[category] > CATEGORY_RANK[existing.category]) {
    existing.category = category
    existing.label = cleaned
  }
}

function addLabels(map, order, category, labels) {
  for (const label of labels || []) {
    addSkill(map, order, category, label)
  }
}

function addSuggestions(map, order, category, suggestions) {
  for (const suggestion of suggestions || []) {
    addSkill(map, order, category, labelFromSuggestion(suggestion))
  }
}

export function buildSkillExtractionText(jobDescription, skillEvidence) {
  const description = cleanLabel(jobDescription)
  const evidence = cleanLabel(skillEvidence)
  if (!evidence) return description
  if (!description) return `Required skills seen in this job:\n${evidence}`
  return `${description}\n\nRequired skills seen in this job:\n${evidence}`
}

export function mergeSkillSuggestions(current, preview) {
  const merged = new Map()
  const order = []

  addLabels(merged, order, "primarySkills", current.primarySkills)
  addLabels(merged, order, "secondarySkills", current.secondarySkills)
  addLabels(merged, order, "emergingSkills", current.emergingSkills)

  addSuggestions(merged, order, "primarySkills", preview.primary_skills)
  addSuggestions(merged, order, "secondarySkills", preview.secondary_skills)
  addSuggestions(merged, order, "emergingSkills", preview.emerging_skills)

  const buckets = {
    primarySkills: [],
    secondarySkills: [],
    emergingSkills: [],
  }

  for (const key of order) {
    const skill = merged.get(key)
    buckets[skill.category].push(skill.label)
  }

  return buckets
}
