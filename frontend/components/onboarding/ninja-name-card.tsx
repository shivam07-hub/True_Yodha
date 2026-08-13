"use client"

import { useEffect, useState } from "react"
import { users as usersApi } from "@/lib/api"
import { trackEvent } from "@/lib/analytics"
import { Button } from "@/components/ui/button"

/**
 * The naming moment — inline, never its own screen.
 *
 * This used to be `NinjaNameStep`, a full onboarding step, and it was deleted in
 * `0bfba93c` when the first-run journey was cut to three steps. Two things were
 * wrong with it, and only one of them was the deletion:
 *
 * 1. It was a step, so it stood between the user and the thing they came for.
 *    It now sits beside the payoff and gates nothing.
 * 2. Its copy was a slug form — "Pick your public name", plus the character
 *    rules. It never said why Myro has a made-up name or why the reader should
 *    want one, so 476 of 481 users kept the random default they were handed.
 *
 * The suggestion is built from the user's real name by `ninja_name.suggestion_for`
 * rather than echoing back the random signup slug, because asking someone to
 * confirm "cosmic-otter-4b1x" reads as a chore, and editing "shivam-pathak-9k2v"
 * reads as an upgrade.
 *
 * Renders nothing at all once claimed. A second ask would undo the point.
 */

const NAME_RE = /^[a-z0-9-]{3,32}$/

export function NinjaNameCard({ token }: { token: string }) {
  const [suggested, setSuggested] = useState<string | null>(null)
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    usersApi
      .suggestNinjaName(token)
      .then((res) => {
        // Already theirs — the moment has nothing to offer, so it never appears.
        if (cancelled || res.claimed) return
        setSuggested(res.ninja_name)
        setValue(res.ninja_name)
      })
      .catch(() => {
        // A dead suggestion endpoint must not put an error on the screen where
        // the user is picking their first role. Stay invisible instead.
        if (!cancelled) setDismissed(true)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  async function claim() {
    const chosen = value.trim().toLowerCase()
    if (busy) return
    if (!NAME_RE.test(chosen)) {
      setError("3 to 32 characters. Lowercase letters, numbers and dashes.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await usersApi.updateNinjaName(token, chosen)
      // Whether the suggestion was good enough to keep is the number that says
      // if the name-derived default actually fixed the 476-skipped problem.
      trackEvent("ninja_name_claimed", { choice: res.ninja_name === suggested ? "kept" : "edited" })
      setDone(true)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "That name would not stick. Try another."
      setError(message.includes("taken") ? "Taken. Someone got there first." : message)
    } finally {
      setBusy(false)
    }
  }

  if (dismissed || !suggested) return null

  if (done) {
    return (
      <div className="mt-8 rounded-lg border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-5">
        <p className="text-sm text-[var(--tm-text)]">
          You are <span className="font-mono font-medium">{value.trim().toLowerCase()}</span>. Good name.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-8 rounded-lg border border-[var(--tm-border-soft)] bg-[var(--tm-surface)] p-5">
      <h2 className="text-base font-semibold text-[var(--tm-text)]">Pick your ninja name</h2>
      <p className="mt-2 text-pretty text-sm leading-6 text-[var(--tm-text-muted)]">
        Myro is one. We read live career pages and score CVs under a made-up name, and
        yours works the same way: it goes on your public profile so nobody has to see
        your real one next to a job hunt.
      </p>

      <label htmlFor="ninja-name" className="mt-4 block text-xs text-[var(--tm-text-faint)]">
        himyro.com/profile/
      </label>
      <input
        id="ninja-name"
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => {
          setValue(event.target.value.toLowerCase())
          setError(null)
        }}
        className="tm-control-focus mt-1 w-full rounded-md border border-[var(--tm-border-soft)] bg-[var(--tm-surface-1)] px-3 py-2 font-mono text-sm text-[var(--tm-text)]"
      />
      <p className="mt-2 text-xs text-[var(--tm-text-faint)]">
        Make it stupid. Nobody has ever regretted being chai-fuelled-panda.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--tm-danger)]">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button size="sm" disabled={busy || !value.trim()} onClick={() => void claim()}>
          {busy ? "Claiming…" : "Claim it"}
        </Button>
        <button
          type="button"
          onClick={() => {
            trackEvent("ninja_name_skipped")
            setDismissed(true)
          }}
          className="tm-control-focus tm-dismiss-action rounded text-sm text-[var(--tm-text-muted)] underline underline-offset-4"
        >
          Later
        </button>
      </div>
    </div>
  )
}
