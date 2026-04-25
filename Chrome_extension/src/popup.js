import { saveImport, previewImport } from "./api.js"
import { extractFromDocument, KNOWN_SELECTOR_LIST } from "./extractors.js"
import { getConfig } from "./storage.js"

const browserPreview = typeof chrome === "undefined" || !chrome.tabs || !chrome.scripting

const elements = {
  status: document.querySelector("#status"),
  authView: document.querySelector("#auth-view"),
  readyView: document.querySelector("#ready-view"),
  reviewView: document.querySelector("#review-view"),
  savedView: document.querySelector("#saved-view"),
  errorView: document.querySelector("#error-view"),
  trackButton: document.querySelector("#track-button"),
  retryButton: document.querySelector("#retry-button"),
  saveButton: document.querySelector("#save-button"),
  settingsLinks: document.querySelectorAll("[data-open-settings]"),
  roleName: document.querySelector("#role-name"),
  companyName: document.querySelector("#company-name"),
  location: document.querySelector("#location"),
  jobDescription: document.querySelector("#job-description"),
  primaryChips: document.querySelector("#primary-chips"),
  secondaryChips: document.querySelector("#secondary-chips"),
  emergingChips: document.querySelector("#emerging-chips"),
  primaryInput: document.querySelector("#primary-input"),
  secondaryInput: document.querySelector("#secondary-input"),
  emergingInput: document.querySelector("#emerging-input"),
  errorText: document.querySelector("#error-text"),
  savedTitle: document.querySelector("#saved-title"),
  trackerLink: document.querySelector("#tracker-link"),
  captureMeta: document.querySelector("#capture-meta"),
}

const state = {
  config: { apiUrl: "", token: "" },
  sourceUrl: "",
  sourcePlatform: "generic",
  captureMethod: "visible_page",
  roleName: "",
  companyName: "",
  location: "",
  jobDescription: "",
  primarySkills: [],
  secondarySkills: [],
  emergingSkills: [],
}

function capturePageSnapshot(selectors) {
  const selectorMap = {}
  for (const selector of selectors) {
    const element = document.querySelector(selector)
    if (!element) continue
    selectorMap[selector] = element.getAttribute("content") || element.getAttribute("alt") || element.innerText || element.textContent || ""
  }
  return {
    title: document.title,
    url: location.href,
    selectedText: String(getSelection?.() || ""),
    bodyText: document.body?.innerText || "",
    scripts: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((script) => script.textContent || ""),
    selectors: selectorMap,
  }
}

function makeElement(textContent = "") {
  return {
    textContent,
    innerText: textContent,
    getAttribute() {
      return null
    },
  }
}

function documentFromSnapshot(snapshot) {
  return {
    title: snapshot.title,
    body: makeElement(snapshot.bodyText),
    querySelector(selector) {
      const value = snapshot.selectors?.[selector]
      return value ? makeElement(value) : null
    },
    querySelectorAll(selector) {
      if (selector === 'script[type="application/ld+json"]') {
        return (snapshot.scripts || []).map((script) => makeElement(script))
      }
      return []
    },
  }
}

function sampleSnapshot() {
  return {
    title: "Senior Product Analyst - Acme",
    url: "https://careers.example.com/jobs/senior-product-analyst",
    selectedText: "",
    bodyText:
      "Senior Product Analyst Acme Bengaluru, India Required skills include SQL, Python, product analytics, dashboarding, stakeholder communication, and experiment design. Experience with LangGraph is a plus.",
    scripts: [
      JSON.stringify({
        "@type": "JobPosting",
        title: "Senior Product Analyst",
        hiringOrganization: { name: "Acme" },
        jobLocation: { address: { addressLocality: "Bengaluru", addressCountry: "IN" } },
        description:
          "Required skills include SQL, Python, product analytics, dashboarding, stakeholder communication, and experiment design. Experience with LangGraph is a plus.",
      }),
    ],
    selectors: {},
  }
}

function setView(view) {
  for (const node of [elements.authView, elements.readyView, elements.reviewView, elements.savedView, elements.errorView]) {
    node.hidden = true
  }
  elements[`${view}View`].hidden = false
}

function setStatus(text) {
  elements.status.textContent = text
}

function uniquePush(list, value) {
  const label = value.trim()
  if (label && !list.some((item) => item.toLowerCase() === label.toLowerCase())) {
    list.push(label)
  }
}

function removeAt(list, index) {
  list.splice(index, 1)
  renderSkills()
}

function moveSkill(from, to, index) {
  const [skill] = from.splice(index, 1)
  uniquePush(to, skill)
  renderSkills()
}

function chip(label, actions) {
  const wrapper = document.createElement("span")
  wrapper.className = "skill-chip"
  const text = document.createElement("span")
  text.textContent = label
  wrapper.append(text)
  for (const action of actions) {
    const button = document.createElement("button")
    button.type = "button"
    button.textContent = action.label
    button.title = action.title
    button.setAttribute("aria-label", action.title)
    button.addEventListener("click", action.onClick)
    wrapper.append(button)
  }
  return wrapper
}

function renderChipList(container, labels, actionsForIndex) {
  container.replaceChildren()
  for (const [index, label] of labels.entries()) {
    container.append(chip(label, actionsForIndex(index)))
  }
}

function renderSkills() {
  renderChipList(elements.primaryChips, state.primarySkills, (index) => [
    { label: "S", title: "Move to secondary skills", onClick: () => moveSkill(state.primarySkills, state.secondarySkills, index) },
    { label: "×", title: "Remove skill", onClick: () => removeAt(state.primarySkills, index) },
  ])
  renderChipList(elements.secondaryChips, state.secondarySkills, (index) => [
    { label: "P", title: "Move to primary skills", onClick: () => moveSkill(state.secondarySkills, state.primarySkills, index) },
    { label: "×", title: "Remove skill", onClick: () => removeAt(state.secondarySkills, index) },
  ])
  renderChipList(elements.emergingChips, state.emergingSkills, (index) => [
    { label: "×", title: "Remove emerging skill", onClick: () => removeAt(state.emergingSkills, index) },
  ])
}

function syncFieldsFromState() {
  elements.roleName.value = state.roleName
  elements.companyName.value = state.companyName
  elements.location.value = state.location
  elements.jobDescription.value = state.jobDescription
  elements.captureMeta.textContent = `${state.sourcePlatform} · ${state.captureMethod} · ${Math.round((state.confidence || 0) * 100)}%`
  renderSkills()
}

function syncStateFromFields() {
  state.roleName = elements.roleName.value.trim()
  state.companyName = elements.companyName.value.trim()
  state.location = elements.location.value.trim()
  state.jobDescription = elements.jobDescription.value.trim()
}

async function getActiveSnapshot() {
  if (browserPreview) return sampleSnapshot()
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error("No active tab found.")
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: capturePageSnapshot,
    args: [KNOWN_SELECTOR_LIST],
  })
  return result.result
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
  state.primarySkills = (preview.primary_skills || []).map((skill) => skill.taxonomy_key || skill.label).filter(Boolean)
  state.secondarySkills = (preview.secondary_skills || []).map((skill) => skill.taxonomy_key || skill.label).filter(Boolean)
  state.emergingSkills = (preview.emerging_skills || []).map((skill) => skill.label).filter(Boolean)
}

async function trackCurrentJob() {
  try {
    setStatus("Reading page")
    elements.trackButton.disabled = true
    const snapshot = await getActiveSnapshot()
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

async function saveCurrentJob() {
  try {
    syncStateFromFields()
    if (!state.roleName || !state.jobDescription) throw new Error("Role name and job description are required.")
    setStatus("Saving")
    elements.saveButton.disabled = true
    const saved = browserPreview
      ? { title: state.roleName, job_id: "preview" }
      : await saveImport(state.config.apiUrl, state.config.token, state)
    elements.savedTitle.textContent = saved.title || state.roleName
    elements.trackerLink.href = `${state.config.apiUrl.replace(/\/$/, "").replace(":8000", ":3000")}/tracker`
    setStatus("Saved")
    setView("saved")
  } catch (error) {
    showError(error)
  } finally {
    elements.saveButton.disabled = false
  }
}

function showError(error) {
  elements.errorText.textContent = error instanceof Error ? error.message : String(error)
  setStatus("Check needed")
  setView("error")
}

function addFromInput(input, list) {
  uniquePush(list, input.value)
  input.value = ""
  renderSkills()
}

async function openSettings() {
  if (typeof chrome !== "undefined" && chrome.runtime?.openOptionsPage) {
    await chrome.runtime.openOptionsPage()
    return
  }
  location.href = "options.html"
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
  elements.retryButton.addEventListener("click", () => setView("ready"))
  elements.saveButton.addEventListener("click", saveCurrentJob)
  elements.settingsLinks.forEach((link) => link.addEventListener("click", openSettings))
  document.querySelector("#add-primary").addEventListener("click", () => addFromInput(elements.primaryInput, state.primarySkills))
  document.querySelector("#add-secondary").addEventListener("click", () => addFromInput(elements.secondaryInput, state.secondarySkills))
  document.querySelector("#add-emerging").addEventListener("click", () => addFromInput(elements.emergingInput, state.emergingSkills))
}

init()
