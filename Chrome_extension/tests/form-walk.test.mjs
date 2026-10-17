import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { planStep, runWalk } from "../src/form-walk.js"

describe("company page walk", () => {
  it("stops on Submit and does not plan a click", () => {
    assert.deepEqual(planStep({
      questions: [],
      files: [],
      forward: "submit",
      filledIds: [],
    }), { type: "stop", reason: "submit" })
  })

  it("holds for the CV when the file field has no sheet yet", () => {
    assert.equal(planStep({
      files: [{ id: "resume" }],
      questions: [],
      forward: "next",
      resumeReady: false,
    }).reason, "resume")
  })

  it("walks a Microsoft-shaped form and stops on Submit", async () => {
    const screens = [
      {
        url: "https://apply.careers.microsoft.com/apply",
        hold: null,
        files: [{ id: "resume", label: "Resume" }],
        questions: [],
        forward: "next",
      },
      {
        url: "https://apply.careers.microsoft.com/apply#contact",
        hold: null,
        files: [],
        questions: [
          { id: "email", label: "Email" },
          { id: "notice", label: "Notice period", options: ["15 days", "30 days"] },
        ],
        forward: "next",
      },
      {
        url: "https://apply.careers.microsoft.com/apply#review",
        hold: null,
        files: [],
        questions: [],
        forward: "submit",
      },
    ]
    let screen = 0
    const clicks = []
    const attached = []
    const result = await runWalk({
      resumeReady: true,
      inspect: async () => screens[Math.min(screen, screens.length - 1)],
      resume: async () => ({ filename: "asha.pdf", base64: btoa("%PDF-1.4") }),
      attach: async (id) => { attached.push(id) },
      answers: async (questions) => questions.map((question) => ({
        id: question.id,
        answer: question.id === "notice" ? "30 days" : "asha@example.com",
      })),
      write: async () => {},
      click: async () => {
        clicks.push(screens[screen].forward)
        screen += 1
        return true
      },
    })
    assert.deepEqual(attached, ["resume"])
    assert.deepEqual(clicks, ["next", "next"])
    assert.equal(result.reason, "submit")
    assert.equal(result.status, "Filled. Submit on this page.")
  })

  it("does not click Next on a screen it cannot read", () => {
    assert.equal(planStep({
      questions: [],
      files: [],
      forward: "next",
    }).reason, "unread")
  })
})
