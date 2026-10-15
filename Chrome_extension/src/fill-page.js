/**
 * Read and fill the company page the person already has open.
 * These functions are injected with chrome.scripting, so each one is
 * self-contained: no imports, no submit click, no captcha bypass.
 */

export function inspectPage(doc = globalThis.document) {
  const url = doc.location?.href || ""

  function labelFor(node) {
    if (node.id) {
      const safe = String(node.id).replace(/"/g, "")
      const labelled = doc.querySelector?.(`label[for="${safe}"]`)
      const fromLabel = labelled?.textContent?.replace(/\s+/g, " ").trim()
      if (fromLabel) return fromLabel
    }
    const wrapped = node.closest?.("label")
    const fromWrap = wrapped?.textContent?.replace(/\s+/g, " ").trim()
    if (fromWrap) return fromWrap
    return (
      node.getAttribute?.("aria-label") ||
      node.getAttribute?.("placeholder") ||
      node.getAttribute?.("name") ||
      ""
    ).trim()
  }

  function marker(node) {
    return [node.getAttribute?.("src") || "", node.id || "", String(node.className || "")]
      .join(" ")
      .toLowerCase()
  }

  const widgets = doc.querySelectorAll?.("iframe, script, div") || []
  for (const node of widgets) {
    const blob = marker(node)
    if (
      blob.includes("recaptcha") ||
      blob.includes("hcaptcha") ||
      blob.includes("cf-turnstile") ||
      blob.includes("challenges.cloudflare.com")
    ) {
      return { hold: "captcha", questions: [], url }
    }
  }

  if (doc.querySelector?.("input[type='password']")) {
    return { hold: "login", questions: [], url }
  }

  const questions = []
  const fields = doc.querySelectorAll?.("input, textarea") || []
  for (const node of fields) {
    const tag = String(node.tagName || "").toLowerCase()
    const type = String(node.getAttribute?.("type") || "text").toLowerCase()
    const textLike = tag === "textarea" || ["text", "email", "tel", "url", "search"].includes(type)
    if (!textLike) continue
    const label = labelFor(node)
    if (!label) continue
    const id = node.id || node.getAttribute?.("name") || `q${questions.length}`
    questions.push({ id, label, kind: tag === "textarea" ? "textarea" : "text" })
    if (questions.length >= 12) break
  }
  return { hold: null, questions, url }
}

export function writeAnswers(answers, doc = globalThis.document) {
  let filled = 0
  for (const answer of answers || []) {
    if (!answer?.answer) continue
    const safe = String(answer.id || "").replace(/"/g, "")
    const node =
      (safe && doc.getElementById?.(safe)) ||
      (safe && doc.querySelector?.(`[name="${safe}"]`)) ||
      null
    if (!node) continue
    const tag = String(node.tagName || "").toUpperCase()
    const proto =
      tag === "TEXTAREA" ? globalThis.HTMLTextAreaElement?.prototype : globalThis.HTMLInputElement?.prototype
    const setter = proto && Object.getOwnPropertyDescriptor(proto, "value")?.set
    if (setter) setter.call(node, answer.answer)
    else node.value = answer.answer
    node.dispatchEvent?.(new Event("input", { bubbles: true }))
    node.dispatchEvent?.(new Event("change", { bubbles: true }))
    filled += 1
  }
  return filled
}

export function confirmationText(doc = globalThis.document) {
  const text = String(doc.body?.innerText || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500)
  return { url: doc.location?.href || "", text }
}
