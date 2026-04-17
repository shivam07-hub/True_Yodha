"use client"

import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/lib/hooks/use-auth"
import { scores, jobs } from "@/lib/api"
import { ScoreGauge } from "@/components/onboarding/score-gauge"
import { DomainRadar } from "@/components/dashboard/domain-radar"
import { SkillUpgradeCard } from "@/components/dashboard/skill-upgrade-card"
import { JobMatchCard } from "@/components/dashboard/job-match-card"
import { Skeleton } from "@/components/ui/skeleton"
import { AppShell } from "@/components/app-shell"

export default function DashboardPage() {
  const { token, ready } = useAuth()

  const { data: scoreData, isLoading: scoreLoading } = useQuery({
    queryKey: ["scores", token],
    queryFn: () => scores.me(token!),
    enabled: !!token,
  })

  const { data: jobData, isLoading: jobsLoading } = useQuery({
    queryKey: ["jobs", token],
    queryFn: () => jobs.matches(token!),
    enabled: !!token,
  })

  if (!ready) return null

  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-10">

        {/* Truth Score */}
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
            Truth Score
          </h2>
          {scoreLoading ? (
            <div className="flex flex-col items-center gap-4">
              <Skeleton className="w-48 h-28 rounded-xl" />
              <Skeleton className="w-24 h-8" />
            </div>
          ) : scoreData ? (
            <div className="flex flex-col items-center">
              <ScoreGauge score={scoreData.total_score} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No score yet.{" "}
              <a href="/onboarding" className="underline underline-offset-2">
                Upload your CV
              </a>{" "}
              to get started.
            </p>
          )}
        </section>

        {/* Domain Radar */}
        {scoreData && (
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
              Domain Breakdown
            </h2>
            <DomainRadar domainScores={scoreData.domain_scores} />
          </section>
        )}

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

        {/* Top 10 Job Matches */}
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
            Top Job Matches
          </h2>
          {jobsLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : jobData?.jobs.length ? (
            <div className="flex flex-col gap-3">
              {jobData.jobs.slice(0, 10).map((job) => (
                <JobMatchCard key={job.id} job={job} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No job matches yet.</p>
          )}
        </section>

      </div>
    </AppShell>
  )
}
