"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { onboarding, users } from "@/lib/api"
import { ApiError } from "@/lib/api-error"
import { dataKeys } from "@/lib/domain-data"
import { Button } from "@/components/ui/button"
import "./internships.css"

/**
 * His years, asked once, on a Myro Supported job that states years (Shivam,
 * 2026-11-17). Until he answers he is counted as a maybe for every such job;
 * the answer is marked `user`, so no later CV parse overwrites it. It never
 * blocks Apply. Once saved, the profile carries the number and this is gone.
 */
export function YearsAsk({ token }: { token: string }) {
  const queryClient = useQueryClient()
  const profile = useQuery({
    queryKey: dataKeys.profile(),
    queryFn: () => users.me(token),
  })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!profile.data || profile.data.years_experience != null) return null

  async function save(form: FormData) {
    const raw = String(form.get("years_experience") ?? "").trim()
    if (raw === "") return
    setError(null)
    setPending(true)
    try {
      await onboarding.saveYears(token, Number(raw))
      await queryClient.invalidateQueries({ queryKey: dataKeys.profile() })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save")
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="intern-form intern-years"
      onSubmit={(e) => { e.preventDefault(); void save(new FormData(e.currentTarget)) }}
    >
      <label>Years of experience
        <input name="years_experience" type="number" inputMode="decimal" min={0} max={60} step={0.5} required />
      </label>
      <Button type="submit" variant="neutral" size="lg" loading={pending}>Save</Button>
      {error ? <p className="intern-error">{error}</p> : null}
    </form>
  )
}
