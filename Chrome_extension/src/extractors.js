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
  ["amazon", /(^|\.)amazon\.jobs$/],
  ["mopid", /(^|\.)mopid\.me$/],
]

const KNOWN_SELECTORS = {
  linkedin: {
    // Both the logged-OUT guest view (top-card-*) AND the authenticated view
    // (job-details-*) — the classes differ between them. The guest classes
    // alone silently missed every logged-in capture.
    role: ".top-card-layout__title, .job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title",
    company: ".topcard__org-name-link, .topcard__flavor--black-link, .job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name",
    location: ".topcard__flavor--bullet, .job-details-jobs-unified-top-card__primary-description-container, .jobs-unified-top-card__primary-description",
    description: ".description__text, .show-more-less-html__markup, .jobs-description__content, .jobs-box__html-content",
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
  amazon: {
    role: "h1.title, h1",
    company: ".company",  // usually absent — backstop/JSON-LD fills "Amazon"
    location: ".location-icon + *, .association",
    description: ".content, #job-detail, .job-detail",
  },
  mopid: {
    role: ".header-wrapper__company__title-section",
    company: ".header-wrapper__company__company-section",
    location: ".header-wrapper .tags__content",
    description: ".job-description-container",
  },
}

// Meta tags worth reading — Open Graph + standard description. Captured into the
// page snapshot and read per-field as a secondary signal.
const META_SELECTORS = {
  ogTitle: 'meta[property="og:title"]',
  ogSite: 'meta[property="og:site_name"]',
  ogDescription: 'meta[property="og:description"]',
  metaDescription: 'meta[name="description"]',
}

export const META_SELECTOR_LIST = Object.values(META_SELECTORS)

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
  if (!selector) return null
  const element = documentRef.querySelector?.(selector)
  if (!element) return null
  const value = element.getAttribute?.("content") || element.getAttribute?.("alt") || element.innerText || element.textContent
  return cleanText(value)
}

// ── field validators ─────────────────────────────────────────────────────────
// The old extractor would happily store "Job ID: 10426211" as a company. These
// reject the common junk so a weak signal is dropped (→ next source / backstop)
// rather than persisted.

const GENERIC_COMPANY = new Set([
  "jobs", "careers", "job", "apply", "home", "search", "linkedin", "indeed",
  "naukri", "glassdoor", "amazon.jobs", "workday", "greenhouse",
])

export function isPlausibleCompany(value) {
  const t = cleanText(value)
  if (t.length < 2 || t.length > 80) return false
  if (/^job\s*id\b/i.test(t)) return false        // "Job ID: 10426211"
  if (/^(req|requisition|posting)\s*(id|#)/i.test(t)) return false
  if (/^[\d\s.,#:/-]+$/.test(t)) return false      // numbers / ids only
  if (/^https?:\/\//i.test(t)) return false        // a URL
  if (GENERIC_COMPANY.has(t.toLowerCase())) return false
  return true
}

export function isPlausibleRole(value) {
  const t = cleanText(value)
  if (t.length < 2 || t.length > 160) return false
  if (/^https?:\/\//i.test(t)) return false
  if (/^job\s*id\b/i.test(t)) return false
  return true
}

export function isPlausibleLocation(value) {
  const t = cleanText(value)
  if (t.length < 2 || t.length > 120) return false
  if (/^https?:\/\//i.test(t)) return false
  return true
}

// Split a page <title> like "Account Manager - Amazon | amazon.jobs" or
// "Product Manager at Acme | LinkedIn" into role + company, dropping site-name
// tails and id-ish / generic segments. Returns the best plausible candidates.
function inferTitleParts(title) {
  const cleaned = cleanText(title)
  if (!cleaned) return { roleName: null, companyName: null }
  const parts = cleaned
    .split(/\s(?:[|•·–—-]|at|@)\s/i)
    .map((part) => cleanText(part))
    .filter(Boolean)
  const roleName = parts[0] || cleaned
  // Company = the first *later* segment that looks like a real org name
  // (skips "Job ID: …", "LinkedIn", "amazon.jobs", page-id tails).
  const companyName = parts.slice(1).find(isPlausibleCompany) || null
  return { roleName: isPlausibleRole(roleName) ? roleName : null, companyName }
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

/** The richest single source — a schema.org JobPosting. Returns per-field
 *  values (any may be empty); the merge below decides which fields to use. */
export function extractJsonLd(documentRef, sourceUrl) {
  const scripts = Array.from(documentRef.querySelectorAll?.('script[type="application/ld+json"]') || [])
  for (const script of scripts) {
    const parsed = parseJsonMaybe(script.textContent || script.innerText || "")
    const job = flattenJsonLd(parsed).find(isJobPosting)
    if (!job) continue
    const org = job.hiringOrganization
    return {
      roleName: cleanText(job.title),
      companyName: cleanText(typeof org === "string" ? org : org?.name || ""),
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

function extractMeta(documentRef) {
  return {
    ogTitle: textFrom(documentRef, META_SELECTORS.ogTitle),
    ogSite: textFrom(documentRef, META_SELECTORS.ogSite),
    description: textFrom(documentRef, META_SELECTORS.ogDescription)
      || textFrom(documentRef, META_SELECTORS.metaDescription),
  }
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

// Resolve one field from prioritised candidates, keeping the first that passes
// validation. Returns { value, source } or null.
function resolveField(candidates, validate) {
  for (const { value, source } of candidates) {
    const v = cleanText(value)
    if (v && validate(v)) return { value: v, source }
  }
  return null
}

/**
 * Per-field best-signal merge. Each of role/company/location/JD is resolved
 * independently from its strongest *valid* source — so a selected JD no longer
 * forces a junk title-parsed company, and JSON-LD/portal company wins even when
 * the JD came from the user's selection. `needsBackstop` flags the server LLM
 * to fill/validate when a field is still missing or only weakly sourced.
 */
export function extractFromDocument(documentRef, sourceUrl, selectedText = "") {
  const platform = sourcePlatformFromUrl(sourceUrl)
  const selected = cleanText(selectedText)
  const jsonLd = extractJsonLd(documentRef, sourceUrl)
  const portal = extractKnownPortal(documentRef, sourceUrl)
  const meta = extractMeta(documentRef)
  const titleParts = inferTitleParts(documentRef.title || "")
  const bodyText = cleanText(documentRef.body?.innerText || documentRef.body?.textContent || "")
  const ogTitleParts = inferTitleParts(meta.ogTitle || "")

  const role = resolveField([
    { value: jsonLd?.roleName, source: "json_ld" },
    { value: portal?.roleName, source: "known_portal" },
    { value: ogTitleParts.roleName, source: "og" },
    { value: titleParts.roleName, source: "title" },
  ], isPlausibleRole)

  const company = resolveField([
    { value: jsonLd?.companyName, source: "json_ld" },
    { value: portal?.companyName, source: "known_portal" },
    { value: meta.ogSite, source: "og" },
    { value: ogTitleParts.companyName, source: "og" },
    { value: titleParts.companyName, source: "title" },
  ], isPlausibleCompany)

  const location = resolveField([
    { value: jsonLd?.location, source: "json_ld" },
    { value: portal?.location, source: "known_portal" },
  ], isPlausibleLocation)

  // JD: the user's deliberate selection wins (highest intent), then structured,
  // then portal, then meta description, then the whole visible page.
  const jd = resolveField([
    { value: selected.length >= 40 ? selected : "", source: "selected_text" },
    { value: jsonLd?.jobDescription, source: "json_ld" },
    { value: portal?.jobDescription, source: "known_portal" },
    { value: meta.description, source: "og" },
    { value: bodyText, source: "visible_page" },
  ], (v) => v.length > 0)

  // captureMethod tracks JD provenance (the bulk field) — keeps existing
  // semantics + the per-field sources travel separately for the backstop.
  const captureMethod = jd?.source || "visible_page"
  const fieldSources = {
    role: role?.source || null,
    company: company?.source || null,
    location: location?.source || null,
    jobDescription: captureMethod,
  }
  // Backstop when a key field is missing or only came from a weak source
  // (title-parse / whole-page text), so the server LLM can fill/validate.
  const WEAK = new Set(["title", "visible_page"])
  const needsBackstop =
    !company || WEAK.has(fieldSources.company)
    || !role || WEAK.has(fieldSources.role)
    || !location

  const confidence = jsonLd ? 0.92
    : captureMethod === "selected_text" ? 0.7
    : captureMethod === "known_portal" ? 0.84
    : 0.42

  return {
    roleName: role?.value || null,
    companyName: company?.value || null,
    location: location?.value || null,
    jobDescription: jd?.value || "",
    sourceUrl,
    sourcePlatform: platform,
    captureMethod,
    confidence,
    fieldSources,
    needsBackstop,
    // Raw structured signals forwarded to the server LLM backstop.
    jsonLd: jsonLd ? { roleName: jsonLd.roleName, companyName: jsonLd.companyName, location: jsonLd.location } : null,
    pageTitle: cleanText(documentRef.title || ""),
  }
}
