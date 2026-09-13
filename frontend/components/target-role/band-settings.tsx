"use client"

/**
 * Changing your fields after onboarding — Settings' half of the band answer.
 *
 * Shivam's rule for S3: ask the band once during onboarding, changeable in
 * Settings. Without this the band is askable and not editable, which is the
 * worst of the three states — a decision the product took from the user and then
 * would not give back.
 *
 * It renders the SAME `BandChoice` the Direction step does and writes the same
 * column. Its own component rather than more rows inside `settings-modal.tsx`
 * because that file is already four times the size limit; this keeps the modal's
 * growth to one line.
 *
 * Writes on change, not on a Save button: every other control in this modal
 * commits immediately, and a lone Save here would read as the only one that
 * needs confirming. Clearing every field does not empty the feed — the server
 * falls back to the band derived from the person's target roles.
 */

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { BandChoice } from "@/components/target-role/band-choice"
import { dataKeys } from "@/lib/domain-data"
import { users, type CareerBand } from "@/lib/api"
import { useAuth } from "@/lib/hooks/use-auth"
import { useCareerBandOptions } from "@/lib/hooks/use-career-bands"

export function BandSettings({ value }: { value: CareerBand[] }) {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  const options = useCareerBandOptions(token)
  const [draft, setDraft] = useState<CareerBand[]>(value)

  // The profile is the source of truth; a refetch that lands while this is open
  // must win over a stale local draft.
  useEffect(() => { setDraft(value) }, [value])

  const commit = (next: CareerBand[]) => {
    setDraft(next)
    if (!token) return
    void users
      .updateProfile(token, { explored_career_bands: next })
      .then(() => queryClient.invalidateQueries({ queryKey: dataKeys.profile() }))
  }

  return <BandChoice options={options.data ?? []} selected={draft} onChange={commit} layout="rows" />
}
