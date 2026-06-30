import { KNOWN_SELECTOR_LIST, META_SELECTOR_LIST } from "./extractors.js"

export function capturePageSnapshot(selectors) {
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

export function documentFromSnapshot(snapshot) {
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

export function sampleSnapshot() {
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

export async function getActiveSnapshot(browserPreview) {
  if (browserPreview) return sampleSnapshot()
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error("No active tab found.")
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: capturePageSnapshot,
    args: [[...KNOWN_SELECTOR_LIST, ...META_SELECTOR_LIST]],
  })
  return result.result
}

export function previewSkillSuggestions() {
  return {
    primary_skills: [
      { label: "SQL", taxonomy_key: "SQL" },
      { label: "Python", taxonomy_key: "Python (Programming Language)" },
    ],
    secondary_skills: [
      { label: "Stakeholder Management", taxonomy_key: "Stakeholder Management" },
    ],
    emerging_skills: [{ label: "LangGraph" }],
  }
}
