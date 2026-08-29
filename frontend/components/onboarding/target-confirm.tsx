"use client"

/**
 * Onboarding's Direction step — four screens, one write.
 *
 * It used to ask everything at once: a list of role families, a level, a set of
 * cities, lean/avoid and a Myro name, stacked down one page with the submit
 * button under all of it. Same defect as Myro Search, and the same fix, so it
 * uses the same chrome rather than a second copy of it.
 *
 * What did NOT change: the state, the derivations, and `submit()`. The user
 * still answers the same five things and `onboarding.saveTarget` still receives
 * the same payload in one call at the end. Only how many of them are on screen
 * at a time is different — a restructure of the surface, not of the write.
 *
 * The step is score-free on purpose: the cohort selected here is what CREATES
 * the score.
 */

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query"

import { StepActions, StepBack, StepRibbon } from "@/components/journey/journey-chrome"
import { StickyOnboardingActionBar } from "@/components/onboarding/sticky-action-bar"
import {
  DirectionStep, LevelStep, MAX_ROLES, RoleStep, WhereStep,
} from "@/components/onboarding/target-steps"
import { invalidateTargetRoleData } from "@/lib/domain-data"
import {
  onboarding, users as usersApi,
  type OnboardingResult, type RoleFamily, type TargetSeniority,
} from "@/lib/api"
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value"
import { trackEvent } from "@/lib/analytics"

type AwaitingTarget = Extract<OnboardingResult, { kind: "awaiting_target" }>
type Props = {
  token: string
  result: AwaitingTarget
  onConfirmed: () => void
  /** Review the previous step. Non-destructive — nothing here is cleared. */
  onBack?: () => void
  /** Return to where the user actually is, leaving this answer untouched. */
  onForward?: () => void
}

const NAME_RE = /^[a-z0-9-]{3,32}$/

/** Four screens, in the order they narrow the search: the work defines it, the
 *  level bounds it, the place filters it, and the rest only colours it. */
const STEP_KEYS = ["work", "level", "where", "about"] as const
type StepKey = (typeof STEP_KEYS)[number]
const STEP_TITLE: Record<StepKey, string> = {
  work: "The work", level: "Level", where: "Where", about: "About you",
}

export function TargetConfirm({ token, result, onConfirmed, onBack, onForward }: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<RoleFamily[]>(result.selected?.families ?? [])
  const [roleSearch, setRoleSearch] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [locations, setLocations] = useState<string[]>(result.selected?.locations ?? [])
  const [lean, setLean] = useState<string[]>(result.direction?.lean ?? [])
  const [avoid, setAvoid] = useState<string[]>(result.direction?.avoid ?? [])
  const [seniority, setSeniority] = useState<TargetSeniority | null>(
    result.selected?.seniority ?? result.seniority.value,
  )
  const [ninja, setNinja] = useState(() => (result.ninja?.ninja_name ?? "").toLowerCase())
  const [ninjaClaimed, setNinjaClaimed] = useState(() => Boolean(result.ninja?.claimed))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Confirm-skills may return without families so the button stays fast; load them here.
  const bootFamilies = useQuery({
    queryKey: ["role-families", "suggested"],
    queryFn: () => onboarding.roleFamilies(token),
    enabled: result.families.length === 0,
  })
  // Same settled-term rule as RoleFamilyPicker: one request per term the user
  // stopped on, not one per keystroke.
  const roleTerm = useDebouncedValue(roleSearch, 200).trim()
  const searchedFamilies = useQuery({
    queryKey: ["role-families", roleTerm],
    queryFn: () => onboarding.roleFamilies(token, roleTerm),
    enabled: showSearch && roleTerm.length >= 2,
    staleTime: 60_000,
  })
  const locationQueries = useQueries({
    queries: selected.map((family) => ({
      queryKey: ["role-family-locations", family.family],
      queryFn: () => onboarding.roleFamilyLocations(token, family.family),
    })),
  })
  const locationOptions = useMemo(() => {
    const byName = new Map<string, number>()
    for (const query of locationQueries) {
      for (const option of query.data ?? []) {
        byName.set(option.location, (byName.get(option.location) ?? 0) + option.open_count)
      }
    }
    return Array.from(byName.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([location, open_count]) => ({ location, open_count }))
    // `useQueries` returns a fresh array each render; its DATA is the input.
  }, [locationQueries.map((q) => q.dataUpdatedAt).join(",")]) // eslint-disable-line react-hooks/exhaustive-deps

  const searching = showSearch && roleSearch.trim().length >= 2
  const suggested = result.families.length > 0 ? result.families : (bootFamilies.data ?? [])
  const listed = searching ? (searchedFamilies.data ?? []) : suggested
  const families = [...selected, ...listed.filter((row) => !selected.some((p) => p.family === row.family))]
  const totalOpen = selected.reduce((sum, family) => sum + family.open_count, 0)
  const ninjaOk = ninjaClaimed || NAME_RE.test(ninja.trim())
  const canSubmit = selected.length > 0 && Boolean(seniority) && ninjaOk && !busy

  /**
   * What each step still needs — the same rule Myro Search lands on.
   *
   * A returning user reviewing their direction (`onForward` is present, so
   * they came back deliberately) has answers already; walking them through
   * four screens to change one is the toll a stepped flow must not charge.
   */
  const needs: Record<StepKey, boolean> = {
    work: selected.length === 0,
    level: !seniority,
    where: false, // Leaving it open searches everywhere. That is an answer.
    about: !ninjaOk,
  }
  const [at, setAt] = useState<number>(() => {
    const first = STEP_KEYS.findIndex((key) => needs[key])
    return first === -1 ? STEP_KEYS.length - 1 : first
  })
  const step = STEP_KEYS[at]
  const isLast = at === STEP_KEYS.length - 1
  const goTo = (next: number) => setAt(Math.min(Math.max(next, 0), STEP_KEYS.length - 1))

  function toggleFamily(family: RoleFamily) {
    setError(null)
    setSelected((current) => {
      const without = current.filter((pick) => pick.family !== family.family)
      if (without.length !== current.length) return without
      if (current.length >= MAX_ROLES) return current
      return [...current, family]
    })
    setLocations([])
  }

  async function submit() {
    if (!canSubmit || !seniority) return
    setBusy(true); setError(null)
    try {
      if (!ninjaClaimed) {
        const chosen = ninja.trim().toLowerCase()
        if (!NAME_RE.test(chosen)) {
          setError("Myro name: 3–32 characters, lowercase letters, numbers, dashes.")
          setBusy(false)
          return
        }
        const res = await usersApi.updateNinjaName(token, chosen)
        trackEvent("ninja_name_claimed", {
          choice: res.ninja_name === (result.ninja?.ninja_name ?? "").toLowerCase() ? "kept" : "edited",
          surface: "direction",
        })
        setNinjaClaimed(true)
        setNinja(res.ninja_name)
      }
      await onboarding.saveTarget(token, {
        role_titles: selected.map((family) => family.label),
        role_families: selected.map((family) => family.family),
        seniority,
        locations,
        lean,
        avoid,
        finish_onboarding: true,
      })
      trackEvent("onboarding_direction_confirmed", {
        role_count: selected.length,
        location_count: locations.length,
        lean_count: lean.length,
        avoid_count: avoid.length,
      })
      await invalidateTargetRoleData(queryClient)
      onConfirmed()
      router.replace("/market")
    } catch (reason) {
      setBusy(false)
      setError(reason instanceof Error ? reason.message : "Could not save your direction.")
    }
  }

  /** Only where there is genuinely something to skip. Under a step the user has
   *  already answered, "Skip for now" offers to skip nothing. */
  const skippable = step === "where" && locations.length === 0

  return (
    <section className="w-full max-w-lg pb-40" aria-labelledby="target-title">
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          {at > 0 ? (
            <StepBack onBack={() => goTo(at - 1)} />
          ) : onBack ? (
            <StepBack onBack={onBack} label="Back to your CV" />
          ) : null}
          <span id="target-title" className="font-mono text-[length:var(--tm-fs-micro)] uppercase tracking-[0.14em] text-[var(--tm-text-muted)]">
            Direction
          </span>
        </div>
        <StepRibbon
          steps={STEP_KEYS.map((key) => ({
            key,
            title: STEP_TITLE[key],
            asks: needs[key],
            askLabel: needs[key] ? "needs an answer" : undefined,
          }))}
          current={step}
          onJump={(key) => goTo(STEP_KEYS.indexOf(key as StepKey))}
          label="Direction steps"
        />
      </div>

      {step === "work" ? (
        <RoleStep
          families={families}
          selected={selected}
          showSearch={showSearch}
          roleSearch={roleSearch}
          empty={!showSearch && suggested.length === 0 && !bootFamilies.isLoading}
          onToggle={toggleFamily}
          onShowSearch={setShowSearch}
          onSearch={setRoleSearch}
        />
      ) : null}

      {step === "level" ? (
        <LevelStep evidence={result.seniority} value={seniority} onChange={setSeniority} />
      ) : null}

      {step === "where" ? (
        <WhereStep
          totalOpen={totalOpen}
          options={locationOptions}
          selected={locations}
          onChange={setLocations}
        />
      ) : null}

      {step === "about" ? (
        <DirectionStep
          lean={lean}
          avoid={avoid}
          proposed={result.direction?.proposed ?? []}
          onDirection={(next) => { setLean(next.lean); setAvoid(next.avoid) }}
          ninja={ninja}
          ninjaClaimed={ninjaClaimed}
          onNinja={(value) => { setNinja(value); setError(null) }}
        />
      ) : null}

      <StickyOnboardingActionBar error={error} contentClassName="max-w-lg px-5 pt-3 sm:px-8">
        <StepActions
          primaryLabel={
            isLast
              ? busy ? "Taking you to Market…" : "Go to Market"
              : "Continue"
          }
          primaryDisabled={
            isLast
              ? !canSubmit
              : (step === "work" && selected.length === 0) || (step === "level" && !seniority)
          }
          /* The block is stated, not implied by a dead button. A disabled
             control with no reason beside it is the state the user cannot
             act on. */
          note={
            isLast && !canSubmit
              ? !selected.length ? "No role yet — Myro searches on the work."
                : !seniority ? "No level yet."
                  : "Claim your Myro name to finish."
              : step === "work" && selected.length === 0
                ? "Pick at least one. This is what Myro searches on."
                : null
          }
          onPrimary={isLast ? () => void submit() : () => goTo(at + 1)}
          secondaryLabel={skippable ? "Skip for now" : onForward && isLast ? "Leave this as it is" : null}
          onSecondary={skippable ? () => goTo(at + 1) : onForward}
        />
      </StickyOnboardingActionBar>
    </section>
  )
}
