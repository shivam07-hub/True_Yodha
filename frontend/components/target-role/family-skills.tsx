/**
 * What a role family hires for, and how much of it the reader already has.
 *
 * Direction used to name each option with `label` — the family's single most
 * common job title. That name is not unique (twenty families share "Custom
 * Software Engineer", 4,928 live jobs between them) and it is not what the
 * person is choosing: the choice is the L2 cluster, which is what
 * `career_target_snapshots.l2_role_family` scopes the whole prep loop on.
 *
 * So the option is named by its family and described by its skills. The reader
 * sees what the market asks for and what they already hold in one row, and the
 * gap between the two is the thing Direction exists to show them.
 *
 * Owned skills lead, because "do I fit" is the question being answered. They
 * are NOT a subset of `top_skills`: the ranking reads every weight a person
 * matches, so intersecting the two printed an empty list beside a family ranked
 * third (migration 20260909100000).
 */

import { Badge } from "@/components/ui/badge"

const MAX_CHIPS = 4
const MAX_OWNED = 3

export function FamilySkills({
  topSkills,
  matchedSkills,
}: {
  topSkills?: string[]
  matchedSkills?: string[]
}) {
  const owned = (matchedSkills ?? []).slice(0, MAX_OWNED)
  const wanted = (topSkills ?? [])
    .filter((skill) => !owned.includes(skill))
    .slice(0, Math.max(0, MAX_CHIPS - owned.length))

  if (owned.length === 0 && wanted.length === 0) return null

  return (
    <span className="mt-2 flex flex-wrap gap-1.5">
      {owned.map((skill) => (
        // Held skills carry the accent wash; wanted ones stay an outline. The
        // difference must survive a reader who cannot see the accent, so each
        // chip states which it is.
        <Badge key={skill} variant="soft">
          <span className="sr-only">You have </span>
          {skill}
        </Badge>
      ))}
      {wanted.map((skill) => (
        <Badge key={skill} variant="outline">
          <span className="sr-only">Also hiring for </span>
          {skill}
        </Badge>
      ))}
    </span>
  )
}
