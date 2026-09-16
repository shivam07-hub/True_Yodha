import type { ReactNode } from "react"
import type { CareerBand } from "@/lib/api"
import type { UseFollowCompany } from "@/lib/hooks/use-follow-company"
import type { FeedFilters } from "./feed-types"

export interface MarketJobsTabProps {
  token: string
  hasCv: boolean
  targetRoles: string[]
  chipCountMap: Record<string, number>
  selectedCluster: string | null
  onSelectCluster: (cluster: string | null) => void
  initialFilters?: FeedFilters
  initialQuery?: string
  onFiltersChange?: (filters: FeedFilters) => void
  onQueryChange?: (query: string) => void
  initialSkillFacet?: string | null
  onSkillFacetChange?: (skill: string | null) => void
  exploredCareerBands?: CareerBand[]
  onExploredCareerBandsChange?: (bands: CareerBand[]) => void
  targetLocations: string[]
  followCompany: Pick<UseFollowCompany, "followedNames" | "action">
  analyticsEnabled?: boolean
  demandEnabled?: boolean
  onFeedSettled?: () => void
  onDemandSettled?: () => void
  onAnalyticsSettled?: () => void
  header?: ReactNode
  railHead?: ReactNode
}
