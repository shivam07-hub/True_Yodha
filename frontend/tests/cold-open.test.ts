/**
 * #61 S4 — a logged-out Android open of Jobs paints account creation.
 * The web still opens on sign-in, and a session still opens on Jobs.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import vm from "node:vm"

import { ANDROID_APP_REFERRER } from "../lib/platform/app-shell"
import {
  COLD_OPEN_SCRIPT,
  coldOpenRedirect,
  isJobsEntry,
  type ColdOpen,
} from "../lib/platform/cold-open"
import { loginRedirectTarget } from "../lib/hooks/use-auth"

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

function runScript(input: ColdOpen, store: "local" | "tab" = "local"): string | null {
  let replaced: string | null = null
  const local = new Map<string, string>()
  const tab = new Map<string, string>()
  const tokens = store === "local" ? local : tab
  if (input.accessToken) tokens.set("mirror_token", input.accessToken)
  if (input.refreshToken) tokens.set("mirror_refresh_token", input.refreshToken)
  if (input.shellStored) tab.set("myro-app-shell", input.shellStored)
  const storage = (map: Map<string, string>) => ({
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value) },
  })
  const sandbox = {
    URLSearchParams,
    location: {
      pathname: input.pathname,
      search: input.search,
      replace: (url: string) => { replaced = url },
    },
    document: { referrer: input.referrer },
    localStorage: storage(local),
    sessionStorage: storage(tab),
    addEventListener: () => undefined,
    window: null as unknown as object,
  }
  sandbox.window = sandbox
  vm.runInNewContext(COLD_OPEN_SCRIPT, sandbox)
  return replaced
}

test("the app gate opens on account creation and the web gate opens on sign-in", () => {
  assert.equal(loginRedirectTarget("android"), "/signup?shell=android")
  assert.equal(loginRedirectTarget("web"), "/login")
  assert.match(read("lib/hooks/use-auth.ts"), /router\.replace\(loginRedirectTarget\(\)\)/)
  assert.match(read("app/signup/signup-route.tsx"), /Sign in/)
})

test("a logged-out Jobs open inside the app leaves for signup before paint", () => {
  const open: ColdOpen = {
    pathname: "/market",
    search: "?shell=android",
    referrer: "",
    shellStored: null,
    accessToken: null,
    refreshToken: null,
  }
  assert.equal(coldOpenRedirect(open), "/signup?shell=android")
  assert.equal(runScript(open), "/signup?shell=android")
})

test("the same open on the web stays, so the gate can send it to sign-in", () => {
  const open: ColdOpen = {
    pathname: "/market",
    search: "",
    referrer: "https://www.google.com/",
    shellStored: null,
    accessToken: null,
    refreshToken: null,
  }
  assert.equal(coldOpenRedirect(open), null)
  assert.equal(runScript(open), null)
})

test("a session still opens on Jobs, including a refresh token waiting to be exchanged", () => {
  for (const session of [
    { accessToken: "access", refreshToken: null },
    { accessToken: null, refreshToken: "refresh" },
  ]) {
    const open: ColdOpen = {
      pathname: "/market",
      search: "?shell=android",
      referrer: "",
      shellStored: null,
      ...session,
    }
    assert.equal(coldOpenRedirect(open), null, JSON.stringify(session))
    assert.equal(runScript(open), null, JSON.stringify(session))
    assert.equal(runScript(open, "tab"), null, `tab ${JSON.stringify(session)}`)
  }
})

test("the referrer signal and a remembered shell agree with the shell module", () => {
  const referrer = `${ANDROID_APP_REFERRER}/https/www.himyro.com`
  const fromReferrer: ColdOpen = {
    pathname: "/market",
    search: "",
    referrer,
    shellStored: null,
    accessToken: null,
    refreshToken: null,
  }
  const remembered: ColdOpen = {
    ...fromReferrer,
    referrer: "",
    shellStored: "android",
  }
  assert.equal(coldOpenRedirect(fromReferrer), "/signup?shell=android")
  assert.equal(runScript(fromReferrer), "/signup?shell=android")
  assert.equal(coldOpenRedirect(remembered), "/signup?shell=android")
  assert.equal(runScript(remembered), "/signup?shell=android")

  const otherApp: ColdOpen = { ...fromReferrer, referrer: "android-app://com.example.app" }
  assert.equal(coldOpenRedirect(otherApp), null)
  assert.equal(runScript(otherApp), null)
  const prefixed: ColdOpen = { ...fromReferrer, referrer: `${ANDROID_APP_REFERRER}.evil` }
  assert.equal(coldOpenRedirect(prefixed), null)
  assert.equal(runScript(prefixed), null)
})

test("only Jobs is moved before paint; signup and a CV link stay put", () => {
  assert.equal(isJobsEntry("/market"), true)
  assert.equal(isJobsEntry("/market/"), true)
  assert.equal(isJobsEntry("/marketplace"), false)
  const loggedOut = {
    search: "?shell=android",
    referrer: "",
    shellStored: null,
    accessToken: null,
    refreshToken: null,
  }
  assert.equal(coldOpenRedirect({ pathname: "/signup", ...loggedOut }), null)
  assert.equal(coldOpenRedirect({ pathname: "/cv", ...loggedOut }), null)
  assert.equal(runScript({ pathname: "/cv", ...loggedOut }), null)
})

test("the blocking script is the first body script and never stores the shell in localStorage", () => {
  const layout = read("app/layout.tsx")
  const cold = read("lib/platform/cold-open.ts")
  const session = read("lib/session.ts")
  assert.match(session, /ACCESS_TOKEN_KEY = "mirror_token"/)
  assert.match(session, /REFRESH_TOKEN_KEY = "mirror_refresh_token"/)
  assert.match(cold, /mirror_token/)
  assert.match(cold, /mirror_refresh_token/)
  assert.doesNotMatch(cold, /localStorage\.setItem/)
  assert.match(layout, /id="myro-cold-open"/)
  assert.ok(layout.indexOf('id="myro-cold-open"') < layout.indexOf("{children}"))
  const shell = read("components/app-shell.tsx")
  const hold = shell.indexOf("isJobsEntry(pathname)")
  const jobs = shell.indexOf("skeletonForPath(pathname)")
  assert.ok(hold > -1 && jobs > hold)
  assert.match(shell, /<AuthRouteSkeleton \/>/)
})
