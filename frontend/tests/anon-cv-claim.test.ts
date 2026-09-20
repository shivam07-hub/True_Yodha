import test from "node:test"
import assert from "node:assert/strict"

import { claimPendingAnonCv, hasPendingAnonCvClaim } from "../lib/anon-cv-claim"
import {
  readOriginalComposedCvText,
  readStashedComposedCvText,
  readStashedOrigin,
  stashAnonCv,
  stashAnonCvFile,
  stashComposedCvText,
  takeStashedFile,
} from "../lib/anon-cv-stash"
import type { AnonScoreResponse, CVUploadResult, CVUploadSource } from "../lib/api"

const uploadResult = {
  skills_detected: 7,
  score: 74,
  xp_charged: 0,
  new_coin_balance: null,
  redirect_to: "/cv",
} satisfies CVUploadResult

const preview = {
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
} satisfies AnonScoreResponse

function mockSession(): void {
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  })
}

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
  mockSession()

  stashAnonCv(
    new File(["cv"], "ada.pdf", { type: "application/pdf" }),
    preview,
  )

  takeStashedFile()

  assert.match(readStashedComposedCvText() ?? "", /Ada Lovelace/)
  assert.equal(readStashedOrigin(), "file")
  assert.equal(hasPendingAnonCvClaim(), true)
})

test("starting a new anonymous CV upload clears stale composed claim text", () => {
  mockSession()

  stashComposedCvText("old CV text")
  stashAnonCvFile(new File(["new"], "new.pdf", { type: "application/pdf" }))
  takeStashedFile()

  assert.equal(readStashedComposedCvText(), null)
  assert.equal(hasPendingAnonCvClaim(), false)
})

test("a file-origin stash claims as pdf_upload after the File is gone", async () => {
  mockSession()
  stashAnonCv(new File(["cv"], "ada.pdf", { type: "application/pdf" }), preview)
  takeStashedFile()

  const uploads: CVUploadSource[] = []
  const result = await claimPendingAnonCv("token-1", {
    readComposedText: readStashedComposedCvText,
    hasFile: () => false,
    takeFile: () => null,
    stashFile: () => {
      throw new Error("file path should not run")
    },
    clearStash: () => undefined,
    readOrigin: readStashedOrigin,
    uploadText: async (_token, _text, source) => {
      uploads.push(source)
      return uploadResult
    },
    uploadFile: async () => {
      throw new Error("file path should not run")
    },
  })

  assert.deepEqual(uploads, ["pdf_upload"])
  assert.equal(result.claimed, true)
})

test("an unedited file-origin stash uploads the File, not composed text", async () => {
  mockSession()
  const file = new File(["cv"], "ada.pdf", { type: "application/pdf" })
  stashAnonCv(file, preview)

  const files: Array<{ name: string; source: CVUploadSource }> = []
  const result = await claimPendingAnonCv("token-1", {
    readComposedText: readStashedComposedCvText,
    hasFile: () => true,
    takeFile: () => file,
    stashFile: () => {
      throw new Error("should not restash")
    },
    clearStash: () => undefined,
    readOrigin: readStashedOrigin,
    readOriginalComposed: readOriginalComposedCvText,
    uploadText: async () => {
      throw new Error("text path should not run")
    },
    uploadFile: async (_token, uploaded, source) => {
      files.push({ name: uploaded.name, source })
      return uploadResult
    },
  })

  assert.deepEqual(files, [{ name: "ada.pdf", source: "pdf_upload" }])
  assert.deepEqual(result, { claimed: true, source: "file", result: uploadResult })
})

test("playground edits on a file-origin stash keep the edits and still bill as a file", async () => {
  mockSession()
  stashAnonCv(new File(["cv"], "ada.pdf", { type: "application/pdf" }), preview)
  stashComposedCvText("Ada Lovelace\nRewritten for the role.")

  const uploads: Array<{ text: string; source: CVUploadSource }> = []
  await claimPendingAnonCv("token-1", {
    readComposedText: readStashedComposedCvText,
    hasFile: () => true,
    takeFile: () => {
      throw new Error("edited file must not be replayed")
    },
    stashFile: () => {
      throw new Error("file path should not run")
    },
    clearStash: () => undefined,
    readOrigin: readStashedOrigin,
    readOriginalComposed: readOriginalComposedCvText,
    uploadText: async (_token, text, source) => {
      uploads.push({ text, source })
      return uploadResult
    },
    uploadFile: async () => {
      throw new Error("file path should not run")
    },
  })

  assert.deepEqual(uploads, [{
    text: "Ada Lovelace\nRewritten for the role.",
    source: "pdf_upload",
  }])
})
