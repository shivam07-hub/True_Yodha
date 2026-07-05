import test from "node:test"
import assert from "node:assert/strict"

import { claimPendingAnonCv, hasPendingAnonCvClaim } from "../lib/anon-cv-claim"
import {
  readStashedComposedCvText,
  stashAnonCv,
  stashAnonCvFile,
  stashComposedCvText,
  takeStashedFile,
} from "../lib/anon-cv-stash"
import type { CVUploadResult, CVUploadSource } from "../lib/api"

const uploadResult = {
  skills_detected: 7,
  score: 74,
  xp_charged: 0,
  new_coin_balance: null,
  redirect_to: "/cv",
} satisfies CVUploadResult

test("claimPendingAnonCv saves pending composed CV text and clears the stash after success", async () => {
  const uploads: Array<{ token: string; text: string; source: CVUploadSource }> = []
  let cleared = 0

  const result = await claimPendingAnonCv("token-1", {
    readComposedText: () => "Ada Lovelace\nEXPERIENCE\nBuilt reliable systems.",
    hasFile: () => false,
    takeFile: () => null,
    stashFile: () => {
      throw new Error("file path should not run")
    },
    clearStash: () => {
      cleared += 1
    },
    uploadText: async (token, text, source) => {
      uploads.push({ token, text, source })
      return uploadResult
    },
    uploadFile: async () => {
      throw new Error("file path should not run")
    },
  })

  assert.deepEqual(uploads, [{
    token: "token-1",
    text: "Ada Lovelace\nEXPERIENCE\nBuilt reliable systems.",
    source: "text_describe",
  }])
  assert.equal(cleared, 1)
  assert.deepEqual(result, { claimed: true, source: "text", result: uploadResult })
})

test("structured anonymous CV preview remains claimable after the in-memory file is gone", () => {
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  })

  stashAnonCv(
    new File(["cv"], "ada.pdf", { type: "application/pdf" }),
    {
      score: 74,
      verdict: "Strong start",
      skills_detected: 7,
      domains: [],
      gaps: [],
      strengths: [],
      contact: null,
      cv: {
        contact: {
          name: "Ada Lovelace",
          title: "Systems Engineer",
          email: "ada@example.com",
          phone: "",
          location: "Remote",
          linkedin: "",
        },
        summary: "Built reliable systems.",
        education: [],
        experience: [],
        projects: [],
        skills_line: "Python, SQL",
        certs: [],
      },
    },
  )

  takeStashedFile()

  assert.match(readStashedComposedCvText() ?? "", /Ada Lovelace/)
  assert.equal(hasPendingAnonCvClaim(), true)
})

test("starting a new anonymous CV upload clears stale composed claim text", () => {
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  })

  stashComposedCvText("old CV text")
  stashAnonCvFile(new File(["new"], "new.pdf", { type: "application/pdf" }))
  takeStashedFile()

  assert.equal(readStashedComposedCvText(), null)
  assert.equal(hasPendingAnonCvClaim(), false)
})
