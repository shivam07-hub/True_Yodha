import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { confirmationText, inspectPage, writeAnswers } from "../src/fill-page.js"

function node(tag, attrs = {}, text = "") {
  return {
    tagName: tag.toUpperCase(),
    id: attrs.id || "",
    className: attrs.class || "",
    textContent: text,
    value: "",
    closest() {
      return null
    },
    getAttribute(name) {
      return attrs[name] ?? null
    },
    dispatchEvent() {},
  }
}

function page({ fields = [], extra = [], password = false, body = "" }) {
  const labels = new Map(fields.filter((field) => field.id).map((field) => [field.id, field.label]))
  return {
    location: { href: "https://careers.example.com/apply" },
    body: { innerText: body },
    getElementById(id) {
      return fields.find((field) => field.id === id) || null
    },
    querySelector(selector) {
      if (selector === "input[type='password']") return password ? node("input", { type: "password" }) : null
      const match = selector.match(/^label\[for="(.+)"\]$/)
      if (match) {
        const label = labels.get(match[1])
        return label ? { textContent: label } : null
      }
      const named = selector.match(/^\[name="(.+)"\]$/)
      if (named) return fields.find((field) => field.name === named[1]) || null
      return null
    },
    querySelectorAll(selector) {
      if (selector === "iframe, script, div") return extra
      if (selector === "input, textarea") return fields
      return []
    },
  }
}

describe("company page fill", () => {
  it("stops on a captcha and does not collect fields", () => {
    const doc = page({
      extra: [node("iframe", { src: "https://www.google.com/recaptcha/api2/anchor" })],
      fields: [node("input", { id: "email", type: "email" })],
    })
    assert.equal(inspectPage(doc).hold, "captcha")
    assert.deepEqual(inspectPage(doc).questions, [])
  })

  it("stops on a password field", () => {
    const doc = page({ password: true })
    assert.equal(inspectPage(doc).hold, "login")
  })

  it("reads a labelled email field and writes the answer without submitting", () => {
    const email = node("input", { id: "email", type: "email", name: "email" })
    email.label = "Email"
    const submit = node("button", { type: "submit" })
    submit.clicked = false
    const doc = page({ fields: [email] })
    const seen = inspectPage(doc)
    assert.equal(seen.hold, null)
    assert.equal(seen.questions[0].label, "Email")
    const filled = writeAnswers([{ id: "email", answer: "asha@example.com" }], doc)
    assert.equal(filled, 1)
    assert.equal(email.value, "asha@example.com")
    assert.equal(submit.clicked, false)
  })

  it("leaves a blank answer untouched", () => {
    const why = node("textarea", { id: "why" })
    const doc = page({ fields: [why] })
    assert.equal(writeAnswers([{ id: "why", answer: "" }], doc), 0)
    assert.equal(why.value, "")
  })

  it("reads the confirmation text from the page", () => {
    const doc = page({ body: "Application submitted. Thank you for applying." })
    const read = confirmationText(doc)
    assert.equal(read.url, "https://careers.example.com/apply")
    assert.match(read.text, /Application submitted/)
  })
})
