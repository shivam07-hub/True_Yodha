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
  const fields = doc.querySelectorAll?.("input, textarea, select") || []
  for (const node of fields) {
    const tag = String(node.tagName || "").toLowerCase()
    const type = String(node.getAttribute?.("type") || "text").toLowerCase()
    if (type === "file" || type === "hidden" || type === "password") continue
    const textLike = tag === "textarea" || tag === "select" || ["text", "email", "tel", "url", "search"].includes(type)
    if (!textLike) continue
    const label = labelFor(node)
    if (!label) continue
    const id = node.id || node.getAttribute?.("name") || `q${questions.length}`
    const question = { id, label, kind: tag === "textarea" ? "textarea" : tag === "select" ? "select" : "text" }
    if (tag === "select") question.options = optionTexts(node)
    questions.push(question)
    if (questions.length >= 12) break
  }
  const files = []
  for (const node of fields) {
    if (String(node.getAttribute?.("type") || "").toLowerCase() !== "file") continue
    const label = labelFor(node) || "Resume"
    const id = node.id || node.getAttribute?.("name") || `file${files.length}`
    files.push({ id, label })
  }
  return { hold: null, questions, files, forward: forwardKind(doc), url }
}

function optionTexts(node) {
  const options = []
  const nodes = node.querySelectorAll?.("option") || []
  for (const option of nodes) {
    const text = String(option.textContent || "").replace(/\s+/g, " ").trim()
    if (text) options.push(text)
    if (options.length >= 20) break
  }
  return options
}

function controlLabel(node) {
  return String(
    node.textContent || node.getAttribute?.("aria-label") || node.getAttribute?.("value") || "",
  ).replace(/\s+/g, " ").trim().toLowerCase()
}

function controlKind(label) {
  if (/^(submit|apply|apply now|send|send application|submit application)$/.test(label)) return "submit"
  if (/^(next|next step|continue|continue application|save and continue|save & continue)$/.test(label)) return "next"
  return null
}

function forwardControls(doc) {
  const nodes = doc.querySelectorAll?.("button, input[type='submit'], [role='button']") || []
  const found = []
  for (const node of nodes) {
    if (node.disabled || node.getAttribute?.("aria-disabled") === "true") continue
    const kind = controlKind(controlLabel(node))
    if (kind) found.push({ node, kind })
  }
  return found
}

function forwardKind(doc) {
  const found = forwardControls(doc)
  if (found.some((item) => item.kind === "next")) return "next"
  if (found.some((item) => item.kind === "submit")) return "submit"
  return "none"
}

export function clickForward(doc = globalThis.document) {
  const next = forwardControls(doc).find((item) => item.kind === "next")
  if (!next) return false
  next.node.click?.()
  return true
}

export function attachResume(payload, doc = globalThis.document) {
  const id = String(payload?.id || "").replace(/"/g, "")
  const node = (id && doc.getElementById?.(id)) || null
  if (!node || String(node.getAttribute?.("type") || "").toLowerCase() !== "file") return 0
  if (!payload?.base64 || !globalThis.atob || !globalThis.File || !globalThis.DataTransfer) return 0
  const binary = globalThis.atob(payload.base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  const file = new globalThis.File([bytes], payload.filename || "cv.pdf", { type: "application/pdf" })
  const transfer = new globalThis.DataTransfer()
  transfer.items.add(file)
  node.files = transfer.files
  node.dispatchEvent?.(new Event("change", { bubbles: true }))
  return node.files?.length || 0
}

function writeSelect(node, answer) {
  const wanted = String(answer || "").replace(/\s+/g, " ").trim().toLowerCase()
  const options = node.querySelectorAll?.("option") || []
  for (const option of options) {
    const text = String(option.textContent || "").replace(/\s+/g, " ").trim().toLowerCase()
    const value = String(option.value || option.getAttribute?.("value") || "").trim()
    if (text === wanted || value.toLowerCase() === wanted) return value || option.textContent
  }
  return ""
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
    const written = tag === "SELECT" ? writeSelect(node, answer.answer) : answer.answer
    if (tag === "SELECT" && !written) continue
    const proto =
      tag === "SELECT"
        ? globalThis.HTMLSelectElement?.prototype
        : tag === "TEXTAREA"
          ? globalThis.HTMLTextAreaElement?.prototype
          : globalThis.HTMLInputElement?.prototype
    const setter = proto && Object.getOwnPropertyDescriptor(proto, "value")?.set
    if (setter) setter.call(node, written)
    else node.value = written
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
