/**
 * The company-page walk. The popup only starts it. The walk keeps running
 * here, because the popup closes when the page moves.
 */

import { getFiling, getFilingResume, postFilingAnswers, postFilingHold } from "./api.js"
import { attachResume, clickForward, inspectPage, writeAnswers } from "./fill-page.js"
import { runWalk } from "./form-walk.js"
import { getConfig } from "./storage.js"

const BLOCKS = {
  listing_closed: "This role is closed.",
  listing_unconfirmed: "Filing waits until a check finds this role open.",
  below_judge: "Filing waits for a judge score of 3.5 or higher.",
  no_tailored_cv: "Tailor a CV for this role before filing.",
  stale_cv: "Approve the latest CV in Myro.",
  no_yes: "Approve this CV in Myro first.",
}

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error("No active tab found.")
  return tab.id
}

async function onTab(tabId, func, args) {
  const details = { target: { tabId }, func }
  if (args) details.args = args
  const [result] = await chrome.scripting.executeScript(details)
  return result?.result
}

async function walkApplication(jobId) {
  const { apiUrl, token } = await getConfig()
  const filing = await getFiling(apiUrl, token, jobId)
  if (!filing.authorized || !filing.ready) {
    return { reason: filing.blocks?.[0] || "no_yes", status: BLOCKS[filing.blocks?.[0]] || BLOCKS.no_yes }
  }
  const tabId = await activeTabId()
  let resumeReady = false
  try {
    resumeReady = Boolean(await getFilingResume(apiUrl, token, jobId))
  } catch (error) {
    if (error.code === "auth_required") throw error
    resumeReady = false
  }
  return runWalk({
    resumeReady,
    inspect: () => onTab(tabId, inspectPage),
    resume: () => getFilingResume(apiUrl, token, jobId),
    attach: (id, resume) => onTab(tabId, attachResume, [{ id, filename: resume.filename, base64: resume.base64 }]),
    answers: (questions) => postFilingAnswers(apiUrl, token, jobId, questions).then((drafted) => {
      if (drafted.blocks?.length) {
        const error = new Error(BLOCKS[drafted.blocks[0]] || "Filing is waiting.")
        throw error
      }
      return drafted.answers || []
    }),
    write: (answers) => onTab(tabId, writeAnswers, [answers]),
    click: () => onTab(tabId, clickForward),
    hold: (reason) => postFilingHold(apiUrl, token, jobId, reason).catch(() => {}),
    wait: () => new Promise((resolve) => setTimeout(resolve, 700)),
  })
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "walk-application" || !message.jobId) return
  walkApplication(message.jobId)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ reason: "error", status: error?.message || "The page could not be filled." }))
  return true
})
