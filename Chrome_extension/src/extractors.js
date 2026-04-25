const PLATFORM_PATTERNS = [
  ["linkedin", /(^|\.)linkedin\.com$/],
  ["naukri", /(^|\.)naukri\.com$/],
  ["workday", /myworkdayjobs\.com$/],
  ["greenhouse", /(^|\.)greenhouse\.io$/],
  ["lever", /(^|\.)lever\.co$/],
  ["smartrecruiters", /(^|\.)smartrecruiters\.com$/],
  ["ashby", /(^|\.)ashbyhq\.com$/],
  ["icims", /(^|\.)icims\.com$/],
  ["oracle_hcm", /oraclecloud\.com$/],
  ["successfactors", /successfactors\.(com|eu)$/],
]

const KNOWN_SELECTORS = {
  linkedin: {
    role: ".top-card-layout__title",
    company: ".topcard__org-name-link, .topcard__flavor--black-link",
    location: ".topcard__flavor--bullet",
    description: ".description__text, .show-more-less-html__markup",
  },
  naukri: {
    role: ".styles_jd-header-title__rZwM1, h1",
    company: ".styles_jd-header-comp-name__MvqAI, .jd-header-comp-name",
    location: ".styles_jhc__location__W_pVs, .location",
    description: ".styles_JDC__dang-inner-html__h0K4t, .job-desc",
  },
  greenhouse: {
    role: "h1, .app-title",
    company: ".company-name",
    location: ".location",
    description: "#content, .content, .job__description",
  },
  lever: {
    role: ".posting-headline h2, h2",
    company: ".main-header-logo img",
    location: ".posting-categories .location, .location",
    description: ".section-wrapper, .posting-page",
  },
  smartrecruiters: {
    role: "h1",
    company: "[data-testid='job-company'], .company",
    location: "[data-testid='job-location'], .location",
    description: "[data-testid='job-description'], .job-description",
  },
  workday: {
    role: "h2[data-automation-id='jobPostingHeader'], h1",
    company: "[data-automation-id='company'], .company",
    location: "[data-automation-id='locations'], [data-automation-id='location']",
    description: "[data-automation-id='jobPostingDescription'], .jobPostingDescription",
  },
}

export const KNOWN_SELECTOR_LIST = Array.from(
  new Set(
    Object.values(KNOWN_SELECTORS).flatMap((selectors) => [
      selectors.role,
      selectors.company,
      selectors.location,
      selectors.description,
    ]),
  ),
)

export function sourcePlatformFromUrl(sourceUrl) {
  let host = ""
  try {
    host = new URL(sourceUrl).hostname.replace(/^www\./, "")
  } catch {
    return "generic"
  }
  for (const [platform, pattern] of PLATFORM_PATTERNS) {
    if (pattern.test(host)) return platform
  }
  return "generic"
}

function cleanText(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function textFrom(documentRef, selector) {
  const element = documentRef.querySelector?.(selector)
  if (!element) return null
  const value = element.getAttribute?.("content") || element.getAttribute?.("alt") || element.innerText || element.textContent
  return cleanText(value)
}

function inferTitleParts(title) {
  const cleaned = cleanText(title)
  if (!cleaned) return { roleName: null, companyName: null }
  const parts = cleaned
    .split(/\s(?:[|–—-]|at|@)\s/i)
    .map((part) => cleanText(part))
    .filter(Boolean)
  return {
    roleName: parts[0] || cleaned,
    companyName: parts.length > 1 ? parts[1] : null,
  }
}

function parseJsonMaybe(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function flattenJsonLd(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd)
  if (typeof value !== "object") return []
  const graph = value["@graph"]
  return [value, ...flattenJsonLd(graph)]
}

function isJobPosting(item) {
  const type = item?.["@type"]
  return Array.isArray(type) ? type.includes("JobPosting") : type === "JobPosting"
}

function extractLocation(job) {
  const raw = Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation
  const address = raw?.address || raw
  const parts = [
    address?.addressLocality,
    address?.addressRegion,
    address?.addressCountry?.name || address?.addressCountry,
  ].filter(Boolean)
  return parts.length ? parts.join(", ") : cleanText(raw?.name || "")
}

export function extractJsonLd(documentRef, sourceUrl) {
  const scripts = Array.from(documentRef.querySelectorAll?.('script[type="application/ld+json"]') || [])
  for (const script of scripts) {
    const parsed = parseJsonMaybe(script.textContent || "")
    const job = flattenJsonLd(parsed).find(isJobPosting)
    if (!job) continue
    return {
      roleName: cleanText(job.title),
      companyName: cleanText(job.hiringOrganization?.name || ""),
      location: extractLocation(job) || null,
      jobDescription: cleanText(job.description),
      sourceUrl,
      sourcePlatform: sourcePlatformFromUrl(sourceUrl),
      captureMethod: "json_ld",
      confidence: 0.92,
    }
  }
  return null
}

export function extractKnownPortal(documentRef, sourceUrl) {
  const platform = sourcePlatformFromUrl(sourceUrl)
  const selectors = KNOWN_SELECTORS[platform]
  if (!selectors) return null
  const draft = {
    roleName: textFrom(documentRef, selectors.role),
    companyName: textFrom(documentRef, selectors.company),
    location: textFrom(documentRef, selectors.location),
    jobDescription: textFrom(documentRef, selectors.description),
    sourceUrl,
    sourcePlatform: platform,
    captureMethod: "known_portal",
    confidence: 0.84,
  }
  return draft.roleName || draft.jobDescription ? draft : null
}

export function extractVisiblePage(documentRef, sourceUrl) {
  const inferred = inferTitleParts(documentRef.title || "")
  return {
    roleName: inferred.roleName,
    companyName: inferred.companyName,
    location: null,
    jobDescription: cleanText(documentRef.body?.innerText || documentRef.body?.textContent || ""),
    sourceUrl,
    sourcePlatform: sourcePlatformFromUrl(sourceUrl),
    captureMethod: "visible_page",
    confidence: 0.42,
  }
}

export function extractFromDocument(documentRef, sourceUrl, selectedText = "") {
  const selected = cleanText(selectedText)
  if (selected.length >= 40) {
    const inferred = inferTitleParts(documentRef.title || "")
    return {
      roleName: inferred.roleName,
      companyName: inferred.companyName,
      location: null,
      jobDescription: selected,
      sourceUrl,
      sourcePlatform: sourcePlatformFromUrl(sourceUrl),
      captureMethod: "selected_text",
      confidence: 0.88,
    }
  }

  return (
    extractJsonLd(documentRef, sourceUrl) ||
    extractKnownPortal(documentRef, sourceUrl) ||
    extractVisiblePage(documentRef, sourceUrl)
  )
}
