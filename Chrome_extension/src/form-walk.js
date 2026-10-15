/**
 * One step of a company-page walk. The page is already read. This decides
 * the next action and never clicks. Submit stays with the person.
 */

export const MAX_STEPS = 8

const STATUS = {
  submit: "Filled. Submit on this page.",
  resume: "Attach the CV for this job on this page.",
  login: "Sign in on this page, then fill.",
  captcha: "Finish the check on this page yourself.",
  unanswered: "A question needs you. Myro left it blank.",
  unread: "This screen has no fields Myro can fill.",
  stuck: "This screen did not move.",
  done: "No further step on this page.",
  limit: "Filled the screens Myro could reach. Submit if this is the last one.",
}

export function statusText(reason) {
  return STATUS[reason] || STATUS.done
}

export function planStep(page) {
  const filled = new Set(page.filledIds || [])
  if (page.hold) return { type: "hold", reason: page.hold }
  const file = (page.files || []).find((item) => !filled.has(item.id))
  if (file) {
    return page.resumeReady
      ? { type: "attach", id: file.id }
      : { type: "hold", reason: "resume" }
  }
  const pending = (page.questions || []).filter((item) => !filled.has(item.id))
  if (pending.length) return { type: "fill", questions: pending }
  if (page.forward === "submit") return { type: "stop", reason: "submit" }
  if (page.forward === "next") {
    const saw = (page.questions || []).length + (page.files || []).length
    if (saw === 0) return { type: "stop", reason: "unread" }
    return { type: "next" }
  }
  return { type: "stop", reason: "done" }
}

function signature(page) {
  return JSON.stringify([
    page.url || "",
    page.forward || "none",
    (page.questions || []).map((item) => item.id),
    (page.files || []).map((item) => item.id),
  ])
}

/**
 * Walk until the page asks the person to submit, or it cannot move.
 * `adapters` are the browser and the filing API. This function does no I/O
 * of its own.
 */
export async function runWalk(adapters) {
  const filled = new Set()
  let previous = ""
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const page = await adapters.inspect()
    if (!page) return { reason: "unread", status: statusText("unread") }
    const action = planStep({
      ...page,
      resumeReady: Boolean(adapters.resumeReady),
      filledIds: [...filled],
    })
    if (action.type === "hold") {
      await adapters.hold?.(action.reason)
      return { reason: action.reason, status: statusText(action.reason) }
    }
    if (action.type === "attach") {
      const resume = await adapters.resume()
      if (!resume?.base64) {
        await adapters.hold?.("resume")
        return { reason: "resume", status: statusText("resume") }
      }
      await adapters.attach(action.id, resume)
      filled.add(action.id)
      continue
    }
    if (action.type === "fill") {
      const answers = await adapters.answers(action.questions)
      await adapters.write(answers)
      let blank = false
      for (const answer of answers || []) {
        if (answer?.answer) filled.add(answer.id)
        else blank = true
      }
      if (blank) {
        await adapters.hold?.("unanswered")
        return { reason: "unanswered", status: statusText("unanswered") }
      }
      continue
    }
    if (action.type === "next") {
      const mark = signature(page)
      if (mark === previous) {
        return { reason: "stuck", status: statusText("stuck") }
      }
      previous = mark
      const clicked = await adapters.click()
      if (!clicked) return { reason: "submit", status: statusText("submit") }
      await adapters.wait?.()
      continue
    }
    return { reason: action.reason, status: statusText(action.reason) }
  }
  return { reason: "limit", status: statusText("limit") }
}
