"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Banknote,
  Briefcase,
  Building2,
  ChevronRight,
  Factory,
  Flame,
  Globe,
  Heart,
  Server,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { Skeleton } from "@/components/ui/skeleton"
import { DrillDownDialog } from "@/components/market/drill-down-dialog"
import { ActionPlanPanel } from "@/components/market/action-plan-panel"
import { FilterBar } from "@/components/market/filter-bar"
import { jobs, type MarketAnalytics, type NameCountItem, type SkillCountItem } from "@/lib/api"

// ─── helpers ────────────────────────────────────────────────────────────────

function getIndustryIcon(industry: string): LucideIcon {
  const l = industry.toLowerCase()
  if (l.includes("tech") || l.includes("software") || l.includes(" it") || l.startsWith("it")) return Server
  if (l.includes("bank") || l.includes("financ") || l.includes("insurance")) return Banknote
  if (l.includes("health") || l.includes("pharma") || l.includes("medical") || l.includes("biotech")) return Heart
  if (l.includes("manufactur") || l.includes("industrial") || l.includes("auto")) return Factory
  if (l.includes("consult") || l.includes("staffing")) return Users
  if (l.includes("retail") || l.includes("commerce") || l.includes("consumer")) return ShoppingCart
  return Briefcase
}

function formatBatch(batch: string | null): string {
  if (!batch) return "—"
  const s = String(batch)
  if (s.length !== 8) return s
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

// ─── insight banner ─────────────────────────────────────────────────────────

interface InsightBannerProps {
  topSkill: SkillCountItem
  topCompany: NameCountItem
  totalJobs: number
}

function InsightBanner({ topSkill, topCompany, totalJobs }: InsightBannerProps) {
  const pct = totalJobs > 0 ? Math.round((topSkill.count / totalJobs) * 100) : 0
  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-primary/8 via-primary/4 to-transparent p-4">
      <div className="absolute right-3 top-3 opacity-10">
        <Sparkles className="h-12 w-12 text-primary" />
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">
        Market Signal
      </p>
      <p className="mt-2 text-sm font-semibold leading-snug">
        <span className="text-primary">{topSkill.skill}</span> appears in{" "}
        <span className="text-primary">{pct}%</span> of all active job postings.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {topCompany.name} is the top hiring company right now with {topCompany.count.toLocaleString()} open roles.
        Tag skills below to build your personal action plan.
      </p>
    </div>
  )
}

// ─── stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

// ─── skill demand row ────────────────────────────────────────────────────────

interface SkillDemandRowProps {
  skill: string
  count: number
  max: number
  rank: number
  tagged: boolean
  onToggle: (skill: string) => void
}

function SkillDemandRow({ skill, count, max, rank, tagged, onToggle }: SkillDemandRowProps) {
  const isHot = rank < 3
  const pct = max > 0 ? (count / max) * 100 : 0

  return (
    <div className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${tagged ? "bg-primary/5" : "hover:bg-muted/40"}`}>
      {/* rank */}
      <span className={`w-5 shrink-0 text-center text-[11px] font-bold tabular-nums ${isHot ? "text-primary" : "text-muted-foreground/50"}`}>
        {rank + 1}
      </span>

      {/* name + bar */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {isHot && <Flame className="h-3 w-3 shrink-0 text-orange-500" />}
          <span className="truncate text-sm font-medium">{skill}</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${isHot ? "bg-primary" : "bg-primary/40"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* count */}
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count.toLocaleString()}</span>

      {/* tag button */}
      <button
        onClick={() => onToggle(skill)}
        title={tagged ? `Untag "${skill}"` : `Tag "${skill}" for your action plan`}
        className={[
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs transition-all",
          tagged
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border text-muted-foreground hover:border-primary hover:text-primary",
        ].join(" ")}
      >
        {tagged ? <X className="h-3 w-3" /> : <span className="font-bold leading-none">+</span>}
      </button>
    </div>
  )
}

// ─── company / industry row ──────────────────────────────────────────────────

interface EntityRowProps {
  label: string
  count: number
  max: number
  icon: LucideIcon
  skillsWanted?: number
  onClick: () => void
}

function EntityRow({ label, count, max, icon: Icon, skillsWanted, onClick }: EntityRowProps) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 active:bg-muted"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="block truncate text-sm font-medium" title={label}>{label}</span>
          {skillsWanted != null && skillsWanted > 0 && (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              {skillsWanted} match
            </span>
          )}
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary/50 transition-all group-hover:bg-primary/70"
            style={{ width: `${(count / max) * 100}%` }}
          />
        </div>
      </span>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{count.toLocaleString()}</span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  )
}

// ─── section header ──────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint: string }) {
  return (
    <div className="mb-3">
      <h2 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h2>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}

// ─── page ────────────────────────────────────────────────────────────────────

type Selected = { name: string; type: "company" | "industry" } | null

function deriveFilteredSkills(
  data: MarketAnalytics,
  selectedCompanies: Set<string>,
  selectedIndustries: Set<string>,
): SkillCountItem[] {
  if (selectedCompanies.size === 0 && selectedIndustries.size === 0) return data.top_skills
  const counts: Record<string, number> = {}
  for (const c of Array.from(selectedCompanies)) {
    for (const s of data.company_skills[c] ?? []) counts[s] = (counts[s] ?? 0) + 1
  }
  for (const i of Array.from(selectedIndustries)) {
    for (const s of data.industry_skills[i] ?? []) counts[s] = (counts[s] ?? 0) + 1
  }
  return Object.entries(counts)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
}

export default function MarketPage() {
  const [selected, setSelected] = useState<Selected>(null)
  const [taggedSkills, setTaggedSkills] = useState<Set<string>>(new Set())
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set())
  const [selectedIndustries, setSelectedIndustries] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ["market-analytics"],
    queryFn: jobs.analytics,
    staleTime: 5 * 60 * 1000,
  })

  const allCompanyItems = (data?.by_company ?? []).map((c: NameCountItem) => ({ label: c.name, count: c.count }))
  const allIndustryItems = (data?.by_industry ?? []).map((c: NameCountItem) => ({ label: c.name, count: c.count }))

  // Apply filters
  const isFiltered = selectedCompanies.size > 0 || selectedIndustries.size > 0
  const companyItems = selectedCompanies.size > 0
    ? allCompanyItems.filter((c) => selectedCompanies.has(c.label))
    : allCompanyItems
  const industryItems = selectedIndustries.size > 0
    ? allIndustryItems.filter((i) => selectedIndustries.has(i.label))
    : allIndustryItems

  const skillItems: SkillCountItem[] = data
    ? deriveFilteredSkills(data, selectedCompanies, selectedIndustries)
    : []

  const filteredActiveRoles = isFiltered
    ? companyItems.reduce((s, c) => s + c.count, 0) +
      (selectedIndustries.size > 0 && selectedCompanies.size === 0
        ? industryItems.reduce((s, i) => s + i.count, 0)
        : 0)
    : (data?.total_jobs ?? 0)

  const maxSkill = skillItems[0]?.count ?? 1
  const maxCompany = companyItems[0]?.count ?? 1
  const maxIndustry = industryItems[0]?.count ?? 1

  function toggleCompany(name: string) {
    setSelectedCompanies((prev) => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })
  }
  function toggleIndustry(name: string) {
    setSelectedIndustries((prev) => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })
  }
  function clearFilters() {
    setSelectedCompanies(new Set())
    setSelectedIndustries(new Set())
  }

  const dialogSkills = selected
    ? (selected.type === "company"
        ? (data?.company_skills ?? {})[selected.name]
        : (data?.industry_skills ?? {})[selected.name]) ?? []
    : []
  const dialogCount = selected
    ? (selected.type === "company" ? allCompanyItems : allIndustryItems).find((i) => i.label === selected.name)?.count ?? 0
    : 0

  function toggleSkill(skill: string) {
    setTaggedSkills((prev) => {
      const next = new Set(prev)
      next.has(skill) ? next.delete(skill) : next.add(skill)
      return next
    })
  }

  function removeSkill(skill: string) {
    setTaggedSkills((prev) => {
      const next = new Set(prev)
      next.delete(skill)
      return next
    })
  }

  // count how many tagged skills each company/industry is hiring for
  function skillOverlap(entityName: string, type: "company" | "industry"): number {
    if (taggedSkills.size === 0) return 0
    const entitySkills: string[] = (type === "company"
      ? (data?.company_skills ?? {})
      : (data?.industry_skills ?? {}))[entityName] ?? []
    return entitySkills.filter((s) => taggedSkills.has(s)).length
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-8 pb-8">

        {/* Header */}
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <Globe className="h-4 w-4" />
            Market Intelligence
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Live hiring signals from the job database
            {data?.latest_batch ? ` · Batch ${formatBatch(data.latest_batch)}` : ""}
          </p>
        </div>

        {/* Insight Banner */}
        {!isLoading && data && skillItems.length > 0 && data.by_company.length > 0 && (
          <InsightBanner
            topSkill={skillItems[0]}
            topCompany={data.by_company[0]}
            totalJobs={data.total_jobs}
          />
        )}
        {isLoading && <Skeleton className="h-24 rounded-xl" />}

        {/* Market Pulse */}
        {isLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Active Roles"
              value={filteredActiveRoles.toLocaleString()}
              sub={isFiltered ? "filtered view" : "across all companies"}
            />
            <StatCard
              label="Companies"
              value={selectedCompanies.size > 0 ? selectedCompanies.size : (data?.total_companies ?? "—")}
              sub={selectedCompanies.size > 0 ? "selected" : "actively hiring"}
            />
            <StatCard
              label="Industries"
              value={selectedIndustries.size > 0 ? selectedIndustries.size : (data?.total_industries ?? "—")}
              sub={selectedIndustries.size > 0 ? "selected" : "tracked"}
            />
          </div>
        )}

        {/* Filter Bar */}
        {!isLoading && data && (
          <FilterBar
            activeRoles={filteredActiveRoles}
            totalRoles={data.total_jobs}
            companies={allCompanyItems.map((c) => c.label)}
            industries={allIndustryItems.map((i) => i.label)}
            selectedCompanies={selectedCompanies}
            selectedIndustries={selectedIndustries}
            onToggleCompany={toggleCompany}
            onToggleIndustry={toggleIndustry}
            onClear={clearFilters}
          />
        )}

        {/* Action Plan — full width, above the 3 lists */}
        <ActionPlanPanel
          taggedSkills={taggedSkills}
          onRemoveSkill={removeSkill}
          onClearAll={() => setTaggedSkills(new Set())}
        />

        {/* 3 lists side by side */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">

          {/* Column 1 — Skills in Demand */}
          <section className="flex flex-col">
            <SectionHeader
              icon={TrendingUp}
              title="Skills in Demand"
              hint="Tap + to tag a skill for your action plan"
            />
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
              </div>
            ) : skillItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No skill data yet.</p>
            ) : (
              <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                {skillItems.map((item, i) => (
                  <SkillDemandRow
                    key={item.skill}
                    skill={item.skill}
                    count={item.count}
                    max={maxSkill}
                    rank={i}
                    tagged={taggedSkills.has(item.skill)}
                    onToggle={toggleSkill}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Column 2 — Top Companies Hiring */}
          <section className="flex flex-col">
            <SectionHeader
              icon={Building2}
              title="Top Companies Hiring"
              hint="Tap to see which skills they're recruiting for"
            />
            {isLoading ? (
              <div className="space-y-1">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
            ) : (
              <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                {companyItems.map((item) => (
                  <EntityRow
                    key={item.label}
                    label={item.label}
                    count={item.count}
                    max={maxCompany}
                    icon={Building2}
                    skillsWanted={skillOverlap(item.label, "company")}
                    onClick={() => setSelected({ name: item.label, type: "company" })}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Column 3 — Industry Breakdown */}
          <section className="flex flex-col">
            <SectionHeader
              icon={Zap}
              title="Industry Breakdown"
              hint="Tap to see which skills are in demand"
            />
            {isLoading ? (
              <div className="space-y-1">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
            ) : (
              <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                {industryItems.map((item) => (
                  <EntityRow
                    key={item.label}
                    label={item.label}
                    count={item.count}
                    max={maxIndustry}
                    icon={getIndustryIcon(item.label)}
                    skillsWanted={skillOverlap(item.label, "industry")}
                    onClick={() => setSelected({ name: item.label, type: "industry" })}
                  />
                ))}
              </div>
            )}
          </section>

        </div>

      </div>

      <DrillDownDialog
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        subtitle={`${dialogCount.toLocaleString()} open role${dialogCount !== 1 ? "s" : ""}`}
        skills={dialogSkills}
        taggedSkills={taggedSkills}
        onTagSkill={toggleSkill}
        icon={selected?.type === "company" ? Building2 : getIndustryIcon(selected?.name ?? "")}
      />
    </AppShell>
  )
}
