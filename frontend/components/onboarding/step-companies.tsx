"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, ArrowRight, Building2, Check, Loader2, Search, Star, X } from "lucide-react"

import { jobs, users } from "@/lib/api"
import {
  companyInitials,
  followedRowsToNames,
  isCompanySelected,
  prependCompany,
  removeCompany,
  shouldSearchCompanies,
} from "@/lib/onboarding-company-selection"
import { XP_POLICY } from "@/lib/xp-policy"
import { useXPStore } from "@/store/xpStore"
import "./step-companies.css"
import "./step-companies.states.css"

export type CVAnalysisStatus = "idle" | "running" | "done" | "failed"

interface Props {
  token: string
  cvStatus: CVAnalysisStatus
  cvError: string | null
  finishing: boolean
  onBack: () => void
  onRestartCV: () => void
  onNext: () => void
}

function statusLabel(status: CVAnalysisStatus): string {
  if (status === "done") return "CV analysis ready"
  if (status === "failed") return "CV analysis needs retry"
  if (status === "running") return "CV analysis running"
  return "CV analysis queued"
}

export function StepCompanies({ token, cvStatus, cvError, finishing, onBack, onRestartCV, onNext }: Props) {
  const queryClient = useQueryClient()
  const setBalance = useXPStore((s) => s.setBalance)
  const [input, setInput] = useState("")
  const [debouncedInput, setDebouncedInput] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [pendingNames, setPendingNames] = useState<Set<string>>(() => new Set())
  const [initialized, setInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setDebouncedInput(input.trim()), 220)
    return () => clearTimeout(id)
  }, [input])

  const followedQuery = useQuery({
    queryKey: ["followedCompanies", token],
    queryFn: () => users.followedCompanies(token),
    staleTime: 60_000,
  })

  useEffect(() => {
    if (initialized || !followedQuery.data) return
    setSelected(followedRowsToNames(followedQuery.data.companies))
    setInitialized(true)
  }, [followedQuery.data, initialized])

  const searchQuery = useQuery({
    queryKey: ["onboardingCompanySearch", debouncedInput],
    queryFn: () => jobs.searchCompanies(debouncedInput, 8),
    enabled: shouldSearchCompanies(debouncedInput),
    staleTime: 5 * 60_000,
  })

  const suggestions = useMemo(() => {
    return (searchQuery.data ?? []).filter((name) => !isCompanySelected(selected, name))
  }, [searchQuery.data, selected])

  function addPending(name: string) {
    setPendingNames((prev) => new Set(prev).add(name))
  }

  function removePending(name: string) {
    setPendingNames((prev) => {
      const next = new Set(prev)
      next.delete(name)
      return next
    })
  }

  async function followCompany(name: string) {
    if (selected.length >= XP_POLICY.followedCompanyLimit || isCompanySelected(selected, name)) return
    setError(null)
    addPending(name)
    setSelected((prev) => prependCompany(prev, name, XP_POLICY.followedCompanyLimit))
    try {
      const result = await users.followCompany(token, name)
      if (typeof result.new_xp_balance === "number") {
        setBalance(result.new_xp_balance)
      }
      setInput("")
      queryClient.invalidateQueries({ queryKey: ["followedCompanies"] })
    } catch (err) {
      setSelected((prev) => removeCompany(prev, name))
      setError(err instanceof Error ? err.message : "Could not follow that company.")
    } finally {
      removePending(name)
    }
  }

  async function unfollowCompany(name: string) {
    setError(null)
    addPending(name)
    setSelected((prev) => removeCompany(prev, name))
    try {
      await users.unfollowCompany(token, name)
      queryClient.invalidateQueries({ queryKey: ["followedCompanies"] })
    } catch (err) {
      setSelected((prev) => prependCompany(prev, name, XP_POLICY.followedCompanyLimit))
      setError(err instanceof Error ? err.message : "Could not remove that company.")
    } finally {
      removePending(name)
    }
  }

  const atLimit = selected.length >= XP_POLICY.followedCompanyLimit
  const showEmptySearch =
    shouldSearchCompanies(debouncedInput) &&
    !searchQuery.isLoading &&
    !searchQuery.isError &&
    suggestions.length === 0

  return (
    <section className="tm-onboarding-company" aria-labelledby="target-company-title">
      <div className="tm-onboarding-company-head">
        <button type="button" className="tm-onboarding-back" onClick={onBack} aria-label="Back to role targeting">
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <div>
          <h2 id="target-company-title">Choose target companies</h2>
          <p>Star companies to build your Market heatmap.</p>
        </div>
      </div>

      <div className={`tm-cv-status tm-cv-status-${cvStatus}`} role={cvStatus === "failed" ? "alert" : "status"}>
        <span className="tm-cv-status-icon" aria-hidden="true">
          {cvStatus === "done" ? <Check size={15} /> : cvStatus === "failed" ? <X size={15} /> : <Loader2 size={15} />}
        </span>
        <span>{statusLabel(cvStatus)}</span>
        {cvStatus === "failed" && cvError ? <span className="tm-cv-status-error">{cvError}</span> : null}
        {cvStatus === "failed" ? (
          <button type="button" onClick={onRestartCV}>
            Change CV
          </button>
        ) : null}
      </div>

      <div className="tm-company-grid">
        <div className="tm-company-panel">
          <label className="tm-company-label" htmlFor="target-company-search">
            Company search
          </label>
          <div className="tm-company-search">
            <Search size={18} aria-hidden="true" />
            <input
              id="target-company-search"
              type="text"
              value={input}
              onChange={(event) => {
                setInput(event.target.value)
                setError(null)
              }}
              placeholder={atLimit ? "Company limit reached" : "Search Google, Razorpay, Salesforce..."}
              disabled={atLimit}
              autoComplete="off"
            />
          </div>

          <div className="tm-company-results" aria-live="polite">
            {searchQuery.isLoading ? (
              <div className="tm-company-muted-row">
                <Loader2 size={15} className="tm-company-spin" aria-hidden="true" />
                Searching companies
              </div>
            ) : null}
            {searchQuery.isError ? (
              <div className="tm-company-error" role="alert">Company search is temporarily unavailable.</div>
            ) : null}
            {showEmptySearch ? <div className="tm-company-muted-row">No matching companies found.</div> : null}
            {suggestions.map((name) => {
              const pending = pendingNames.has(name)
              return (
                <button
                  key={name}
                  type="button"
                  className="tm-company-result"
                  onClick={() => followCompany(name)}
                  disabled={pending || atLimit}
                >
                  <span className="tm-company-avatar" aria-hidden="true">{companyInitials(name)}</span>
                  <span className="tm-company-name">{name}</span>
                  <span className="tm-company-star" aria-hidden="true">
                    {pending ? <Loader2 size={15} className="tm-company-spin" /> : <Star size={15} />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="tm-company-panel tm-company-selected-panel">
          <div className="tm-company-selected-head">
            <span>Starred</span>
            <span>{selected.length} / {XP_POLICY.followedCompanyLimit}</span>
          </div>
          {selected.length === 0 ? (
            <div className="tm-company-empty">
              <Building2 size={22} aria-hidden="true" />
              <span>No companies starred yet.</span>
            </div>
          ) : (
            <div className="tm-company-selected-list">
              {selected.map((name) => {
                const pending = pendingNames.has(name)
                return (
                  <div key={name} className="tm-company-selected-row">
                    <span className="tm-company-avatar" aria-hidden="true">{companyInitials(name)}</span>
                    <span className="tm-company-name">{name}</span>
                    <button
                      type="button"
                      onClick={() => unfollowCompany(name)}
                      disabled={pending}
                      aria-label={`Remove ${name}`}
                      title={`Remove ${name}`}
                    >
                      {pending ? <Loader2 size={14} className="tm-company-spin" aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {error ? <p className="tm-company-error" role="alert">{error}</p> : null}

      <div className="tm-company-footer">
        <span>Following costs {XP_POLICY.followCompanyCost} XP per company.</span>
        <button type="button" onClick={onNext} disabled={finishing || cvStatus === "failed"}>
          {finishing ? "Finishing analysis" : selected.length > 0 ? "Continue" : "Skip"}
          {finishing ? <Loader2 size={15} className="tm-company-spin" aria-hidden="true" /> : <ArrowRight size={15} aria-hidden="true" />}
        </button>
      </div>
    </section>
  )
}
