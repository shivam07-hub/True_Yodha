"use client"

import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/use-auth"
import { scores, users } from "@/lib/api"
import { DomainRadar } from "@/components/dashboard/domain-radar"
import { SkillUpgradeCard } from "@/components/dashboard/skill-upgrade-card"
import { SkillIntelligencePanel } from "@/components/tracker/skill-intelligence-panel"
import { Skeleton } from "@/components/ui/skeleton"
import { AppShell } from "@/components/app-shell"

export default function DashboardPage() {
  const { token, ready } = useAuth()

  const { data: scoreData, isLoading: scoreLoading } = useQuery({
    queryKey: ["scores", token],
    queryFn: () => scores.me(token!),
    enabled: !!token,
  })

  const { data: skillsData } = useQuery({
    queryKey: ["user-skills", token],
    queryFn: () => users.mySkills(token!),
    enabled: !!token,
  })

  if (!ready) return null

  return (
    <AppShell>
      <div className="mx-auto flex max-w-5xl flex-col gap-10">

        {/* Domain Breakdown + Skill Intelligence — side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
              Domain Breakdown
            </h2>
            {scoreData ? (
              <DomainRadar
                domainScores={scoreData.domain_scores}
                skillsByDomain={skillsData?.by_domain}
              />
            ) : (
              <Skeleton className="h-64 rounded-xl" />
            )}
          </section>

          <section>
            <SkillIntelligencePanel
              gapSkills={scoreData?.gap_skills ?? []}
              isLoading={scoreLoading}
            />
          </section>
        </div>

        {/* Top 5 Skill Upgrades */}
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
            Top 5 Skills to Upgrade
          </h2>
          {scoreLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : scoreData?.gap_skills.length ? (
            <div className="flex flex-col gap-3">
              {scoreData.gap_skills.slice(0, 5).map((skill, i) => (
                <SkillUpgradeCard key={skill.skill} skill={skill} rank={i + 1} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No skill gaps identified yet.</p>
          )}
        </section>

      </div>
    </AppShell>
  )
}
