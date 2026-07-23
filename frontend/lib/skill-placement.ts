import type { DemandBand } from "@/lib/api"
import type { SkillRoomModel } from "@/lib/skill-room"

/** Structural slice of TaxonomyView — only what placing one skill needs. */
export interface PlacementSource {
  stats: { domains: number; clusters: number; skills: number } | null
  domains: Array<{ name: string; clusters: number; skills: number }>
  clustersOf: (domain: string) => Array<{ name: string; n: number }>
  demandOf: (name: string) => DemandBand | null
}

/**
 * Where Myro filed this skill — the classification path with the scale at each
 * rung, so "one of 35,108" stops being a marketing number and becomes the
 * user's own coordinates.
 *
 * Counts are only ever the REAL taxonomy counts. A domain or cluster the
 * skeleton doesn't know (vocabulary drift between the score domains and the
 * catalogue) reports null and the rung renders without a number — an invented
 * denominator would corrupt the one claim this page exists to make.
 */
export interface SkillPlacement {
  domain: string | null
  /** Clusters Myro tracks in this domain — null when the domain isn't catalogued. */
  domainClusters: number | null
  cluster: string | null
  /** Skills Myro tracks in this cluster — null when the cluster isn't catalogued. */
  clusterSkills: number | null
  /** How many skills the USER holds in that cluster (never a global count). */
  userSkillsInCluster: number
  totals: { domains: number; clusters: number; skills: number } | null
  band: DemandBand | null
  /** True once at least one real rung resolved — otherwise the block stays hidden. */
  resolved: boolean
}

function norm(value: string): string {
  return value.trim().toLowerCase()
}

export function placeSkill(
  room: SkillRoomModel,
  source: PlacementSource | null,
): SkillPlacement | null {
  if (!source) return null

  const domain = room.domain
  const cluster = room.cluster
  const domainRow = domain
    ? source.domains.find((d) => norm(d.name) === norm(domain)) ?? null
    : null
  const clusterRow = domain && cluster
    ? source.clustersOf(domain).find((c) => norm(c.name) === norm(cluster)) ?? null
    : null

  const placement: SkillPlacement = {
    domain,
    domainClusters: domainRow?.clusters ?? null,
    cluster,
    clusterSkills: clusterRow?.n ?? null,
    userSkillsInCluster: room.clusterSize,
    totals: source.stats,
    band: source.demandOf(room.skill.display_name),
    resolved: Boolean(domainRow || clusterRow || source.stats),
  }
  return placement.resolved ? placement : null
}
