import { saveImport, previewImport, reachSearch } from "./api.js"
import { extractFromDocument } from "./extractors.js"
import { documentFromSnapshot, getActiveSnapshot, previewSkillSuggestions } from "./popup-capture.js"
import { renderSkills } from "./skill-chips.js"
import { buildSkillExtractionText, mergeSkillSuggestions } from "./skill-review.js"
import { getConfig, saveConfig } from "./storage.js"

const browserPreview = typeof chrome === "undefined" || !chrome.tabs || !chrome.scripting

const elements = {
  status: document.querySelector("#status"),
  authView: document.querySelector("#auth-view"),
  readyView: document.querySelector("#ready-view"),
  reviewView: document.querySelector("#review-view"),
  savedView: document.querySelector("#saved-view"),
  reachView: document.querySelector("#reach-view"),
  errorView: document.querySelector("#error-view"),
  trackButton: document.querySelector("#track-button"),
  connectButton: document.querySelector("#connect-button"),
  retryButton: document.querySelector("#retry-button"),
  saveButton: document.querySelector("#save-button"),
  reachButton: document.querySelector("#reach-button"),
  reachLead: document.querySelector("#reach-lead"),
  reachAlternates: document.querySelector("#reach-alternates"),
  reachMyroLink: document.querySelector("#reach-myro-link"),
  reachBackButton: document.querySelector("#reach-back-button"),
  extractSkillsButton: document.querySelector("#extract-skills-button"),
  settingsLinks: document.querySelectorAll("[data-open-settings]"),
  roleName: document.querySelector("#role-name"),
  companyName: document.querySelector("#company-name"),
  location: document.querySelector("#location"),
  jobDescription: document.querySelector("#job-description"),
  skillEvidence: document.querySelector("#skill-evidence"),
  primaryChips: document.querySelector("#primary-chips"),
  secondaryChips: document.querySelector("#secondary-chips"),
  emergingChips: document.querySelector("#emerging-chips"),
  errorText: document.querySelector("#error-text"),
  savedTitle: document.querySelector("#saved-title"),
  trackerLink: document.querySelector("#tracker-link"),
  captureMeta: document.querySelector("#capture-meta"),
}

const state = {
  config: { apiUrl: "", token: "", refreshToken: "" },
  sourceUrl: "",
  sourcePlatform: "generic",
  captureMethod: "visible_page",
  roleName: "",
  companyName: "",
  location: "",
  jobDescription: "",
  skillEvidence: "",
  primarySkills: [],
  secondarySkills: [],
  emergingSkills: [],
  savedJobId: "",
}

function setView(view) {
  for (const node of [elements.authView, elements.readyView, elements.reviewView, elements.savedView, elements.reachView, elements.errorView]) {
    node.hidden = true
  }
  elements[`${view}View`].hidden = false
}

// Open a URL in the user's own browser session (their logged-in LinkedIn /
// Google). Myro never fetches it — this is the ADR-0018 wall.
function openTab(url) {
  if (!url) return
  if (typeof chrome !== "undefined" && chrome.tabs?.create) {
    chrome.tabs.create({ url })
  } else {
    window.open(url, "_blank", "noopener")
  }
}

function setStatus(text) {
  elements.status.textContent = text
}

function syncFieldsFromState() {
  elements.roleName.value = state.roleName
  elements.companyName.value = state.companyName
  elements.location.value = state.location
  elements.jobDescription.value = state.jobDescription
  elements.skillEvidence.value = state.skillEvidence
  elements.captureMeta.textContent = `${state.sourcePlatform} · ${state.captureMethod} · ${Math.round((state.confidence || 0) * 100)}%`
  renderSkills(elements, state)
}

function syncStateFromFields() {
  state.roleName = elements.roleName.value.trim()
  state.companyName = elements.companyName.value.trim()
  state.location = elements.location.value.trim()
  state.jobDescription = elements.jobDescription.value.trim()
  state.skillEvidence = elements.skillEvidence.value.trim()
}

function applyPreview(draft, preview) {
  state.sourceUrl = draft.sourceUrl
  state.sourcePlatform = draft.sourcePlatform
  state.captureMethod = draft.captureMethod
  state.confidence = draft.confidence
  state.roleName = preview.role_name || draft.roleName || ""
  state.companyName = preview.company_name || draft.companyName || ""
  state.location = preview.location || draft.location || ""
  state.jobDescription = preview.job_description || draft.jobDescription || ""
  state.skillEvidence = ""
  state.primarySkills = (preview.primary_skills || []).map((skill) => skill.taxonomy_key || skill.label).filter(Boolean)
  state.secondarySkills = (preview.secondary_skills || []).map((skill) => skill.taxonomy_key || skill.label).filter(Boolean)
  state.emergingSkills = (preview.emerging_skills || []).map((skill) => skill.label).filter(Boolean)
}

async function trackCurrentJob() {
  try {
    setStatus("Reading page")
    elements.trackButton.disabled = true
    const snapshot = await getActiveSnapshot(browserPreview)
    const draft = extractFromDocument(documentFromSnapshot(snapshot), snapshot.url, snapshot.selectedText)
    if (!draft.jobDescription || draft.jobDescription.length < 80) {
      setStatus("Needs selection")
      throw new Error("Select the job description on the page and click Track this job again.")
    }

    let preview
    if (browserPreview) {
      preview = {
        role_name: draft.roleName,
        company_name: draft.companyName,
        location: draft.location,
        job_description: draft.jobDescription,
        primary_skills: [{ label: "Python (Programming Language)", taxonomy_key: "Python (Programming Language)" }, { label: "SQL", taxonomy_key: "SQL" }],
        secondary_skills: [{ label: "Product Analytics", taxonomy_key: "Product Analytics" }],
        emerging_skills: [{ label: "LangGraph", normalized_label: "langgraph", skill_type: "secondary" }],
      }
    } else {
      preview = await previewImport(state.config.apiUrl, state.config.token, draft)
    }
    applyPreview(draft, preview)
    syncFieldsFromState()
    setStatus("Review")
    setView("review")
  } catch (error) {
    showError(error)
  } finally {
    elements.trackButton.disabled = false
  }
}

async function extractSkillsFromReview() {
  try {
    syncStateFromFields()
    const extractionText = buildSkillExtractionText(state.jobDescription, state.skillEvidence)
    if (!extractionText) throw new Error("Paste a job description or skills before extracting.")

    setStatus("Extracting skills")
    elements.extractSkillsButton.disabled = true
    const draft = {
      sourceUrl: state.sourceUrl,
      sourcePlatform: state.sourcePlatform || "generic",
      roleName: state.roleName,
      companyName: state.companyName,
      location: state.location,
      jobDescription: extractionText,
      captureMethod: "manual_review",
      needsBackstop: false,
      jsonLd: null,
    }
    const preview = browserPreview
      ? previewSkillSuggestions()
      : await previewImport(state.config.apiUrl, state.config.token, draft)
    const merged = mergeSkillSuggestions(state, preview)
    state.primarySkills = merged.primarySkills
    state.secondarySkills = merged.secondarySkills
    state.emergingSkills = merged.emergingSkills
    renderSkills(elements, state)
    setStatus("Review")
  } catch (error) {
    showError(error)
  } finally {
    elements.extractSkillsButton.disabled = false
  }
}

async function saveCurrentJob() {
  try {
    // Preview may have silently refreshed + rotated the access token into
    // storage. Re-sync so save uses the current token, not a stale one.
    if (!browserPreview) state.config = await getConfig()
    syncStateFromFields()
    if (!state.roleName || !state.jobDescription) throw new Error("Role name and job description are required.")
    setStatus("Saving")
    elements.saveButton.disabled = true
    const saved = browserPreview
      ? { title: state.roleName, job_id: "preview" }
      : await saveImport(state.config.apiUrl, state.config.token, state)
    elements.savedTitle.textContent = saved.title || state.roleName
    // Deep-link straight to this job's Tailor-CV view — the strongest next step
    // ("saved → tailor now"). Falls back to the tracker list if the save somehow
    // returned no job_id.
    const web = frontendBaseUrl(state.config.apiUrl)
    const hasId = saved.job_id && saved.job_id !== "preview"
    state.savedJobId = hasId ? saved.job_id : ""
    elements.trackerLink.href = hasId ? `${web}/cv?jobId=${encodeURIComponent(saved.job_id)}` : `${web}/cv`
    elements.trackerLink.textContent = hasId ? "Tailor your CV" : "Open tracker"
    setStatus("Saved")
    setView("saved")
  } catch (error) {
    showError(error)
  } finally {
    elements.saveButton.disabled = false
  }
}

function renderReach(intel) {
  const primary = intel.primary
  elements.reachLead.textContent = primary
    ? `Opened a search for ${primary.label}. These are the people to reach out to and network with.`
    : "Add a company or role on the page, then try again."
  elements.reachAlternates.innerHTML = ""
  for (const search of intel.alternates || []) {
    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = "button ghost reach-item"
    btn.textContent = search.label
    btn.addEventListener("click", () => openTab(search.url))
    elements.reachAlternates.appendChild(btn)
  }
  // Deep-link into this job's plan in Myro. Slice 3 lands the reach pack in the
  // job drawer; until then this opens the job's CV/tailor workspace.
  const web = frontendBaseUrl(state.config.apiUrl)
  elements.reachMyroLink.href = state.savedJobId
    ? `${web}/cv?jobId=${encodeURIComponent(state.savedJobId)}`
    : `${web}/home`
}

// Free reach search (ADR-0018): ask the backend which roles to look for, open
// the top search in the user's own browser, and show alternates.
async function findPeopleToReach() {
  try {
    setStatus("Finding people")
    elements.reachButton.disabled = true
    const payload = {
      jobTitle: state.roleName,
      company: state.companyName,
      jobDescription: state.jobDescription,
    }
    const intel = browserPreview
      ? {
          reporting_target: "VP",
          primary: { label: `VP ${state.companyName || "team"}`, url: "https://www.linkedin.com/search/results/people/?keywords=VP", kind: "linkedin" },
          alternates: [
            { label: "Director", url: "https://www.linkedin.com/search/results/people/?keywords=Director", kind: "linkedin" },
          ],
        }
      : await reachSearch(state.config.apiUrl, state.config.token, payload)
    renderReach(intel)
    if (intel.primary?.url) openTab(intel.primary.url)
    setStatus("Reach")
    setView("reach")
  } catch (error) {
    showError(error)
  } finally {
    elements.reachButton.disabled = false
  }
}

function frontendBaseUrl(apiUrl) {
  const base = (apiUrl || "").replace(/\/$/, "")
  // Local dev: API on :8000, web on :3000.
  if (base.includes("localhost") || base.includes("127.0.0.1")) {
    return base.replace(":8000", ":3000")
  }
  // Any deployed backend host (api.himyro.com, mirror-backend-prod-production
  // .up.railway.app, truemirror.up.railway.app, …) maps to the canonical web
  // app. NEVER reuse the API host as a web URL — it has no web routes, so links
  // like /tracker and /extension/connect 404 against it.
  return "https://himyro.com"
}

function showError(error) {
  // Auth failures (no token, or expired session with no working refresh) must
  // route to the Connect view — the error view's "Try again" would just re-hit
  // the same 401 and trap the user. Drop the dead token first.
  if (error && error.code === "auth_required") {
    void resetToAuth()
    return
  }
  elements.errorText.textContent = error instanceof Error ? error.message : String(error)
  setStatus("Check needed")
  setView("error")
}

async function resetToAuth() {
  await saveConfig({ apiUrl: state.config.apiUrl, token: "", refreshToken: "" })
  state.config = await getConfig()
  setStatus("Connect")
  setView("auth")
}

async function openSettings() {
  if (typeof chrome !== "undefined" && chrome.runtime?.openOptionsPage) {
    await chrome.runtime.openOptionsPage()
    return
  }
  location.href = "options.html"
}

// Opens the Myro web app's /extension/connect handshake in a managed auth tab.
// The page mints an independent session for the signed-in user and bounces the
// tokens back to chromiumapp.org in the URL fragment, which we parse + store.
// No copy-paste, no manual token.
async function connectMyro() {
  if (browserPreview || !chrome.identity?.launchWebAuthFlow) {
    showError(new Error("Open this from the Myro extension icon to connect."))
    return
  }
  try {
    setStatus("Connecting")
    elements.connectButton.disabled = true
    const redirectUri = chrome.identity.getRedirectURL()
    const authUrl = `${frontendBaseUrl(state.config.apiUrl)}/extension/connect?redirect_uri=${encodeURIComponent(redirectUri)}`
    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (url) => {
        if (chrome.runtime.lastError || !url) {
          reject(new Error(chrome.runtime.lastError?.message || "Connection cancelled."))
        } else {
          resolve(url)
        }
      })
    })
    const frag = new URLSearchParams(new URL(responseUrl).hash.slice(1))
    const accessToken = frag.get("access_token")
    if (!accessToken) throw new Error("Myro didn't return a session. Try again.")
    await saveConfig({
      apiUrl: frag.get("api_url") || state.config.apiUrl,
      token: accessToken,
      refreshToken: frag.get("refresh_token") || "",
    })
    state.config = await getConfig()
    setStatus("Ready")
    setView("ready")
  } catch (error) {
    showError(error)
  } finally {
    elements.connectButton.disabled = false
  }
}

async function init() {
  state.config = await getConfig()
  if (!state.config.token && !browserPreview) {
    setStatus("Connect")
    setView("auth")
  } else {
    setStatus(browserPreview ? "Preview mode" : "Ready")
    setView("ready")
  }

  elements.trackButton.addEventListener("click", trackCurrentJob)
  elements.connectButton?.addEventListener("click", connectMyro)
  elements.retryButton.addEventListener("click", () => setView("ready"))
  elements.saveButton.addEventListener("click", saveCurrentJob)
  elements.reachButton?.addEventListener("click", findPeopleToReach)
  elements.reachBackButton?.addEventListener("click", () => setView("saved"))
  elements.extractSkillsButton.addEventListener("click", extractSkillsFromReview)
  elements.settingsLinks.forEach((link) => link.addEventListener("click", openSettings))
}

init()
