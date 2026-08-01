"use client"

import { useMemo, useState } from "react"
import { ArrowRight, HandCoins, Network, Radar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { B2BWorkspaceShell, type WorkspaceMetric } from "./workspace-shell"
import {
  buildReferralLeaders,
  buildReferralQueue,
  buildReferralStatus,
  REFERRAL_COMPANIES,
  REFERRAL_TABS,
  type ReferralTab,
} from "./referral-model"

export function ReferralDashboard() {
  const [activeTab, setActiveTab] = useState<ReferralTab>("queue")
  const [companyFilter, setCompanyFilter] = useState<(typeof REFERRAL_COMPANIES)[number]>("All companies")

  const queue = useMemo(() => buildReferralQueue(companyFilter), [companyFilter])
  const stages = useMemo(() => buildReferralStatus(queue), [queue])
  const leaders = useMemo(() => buildReferralLeaders(queue), [queue])
  const topEntry = queue[0]

  const metrics: WorkspaceMetric[] = [
    { label: "Warm paths live", value: `${queue.length}`, hint: "filtered to candidates a referrer can credibly back" },
    { label: "Intros in motion", value: `${queue.filter((entry) => entry.status !== "Ready to intro").length}`, hint: "the loop stays visible after the intro is sent" },
    { label: "Rewardable impact", value: `${queue.reduce((sum, entry) => sum + entry.reward, 0)} coins`, hint: "reward logic tracks outcomes instead of raw messages sent" },
  ]

  return (
    <B2BWorkspaceShell
      eyebrow="myro referral workspace"
      title={
        <>
          Route warm intros into a <em>trusted hiring loop</em>.
        </>
      }
      subtitle="This is the referral-side mirror: pick the strongest candidate-company path, show why the intro matters, and keep the status visible after the message leaves."
      metrics={metrics}
      tabs={REFERRAL_TABS as unknown as { id: string; label: string; hint: string }[]}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      primaryAction={{ label: "Open status loop", onClick: () => setActiveTab("status") }}
      secondaryAction={{ label: "Review rewards", onClick: () => setActiveTab("rewards") }}
    >
      {activeTab === "queue" ? (
        <div className="b2bws-grid">
          <section className="b2bws-panel">
            <span className="b2bws-kicker">warm intro queue</span>
            <h2>Back only the candidates worth your social capital.</h2>
            <div className="b2bws-chip-row">
              {REFERRAL_COMPANIES.map((company) => (
                <button
                  key={company}
                  type="button"
                  className="b2bws-chip"
                  data-active={companyFilter === company}
                  onClick={() => setCompanyFilter(company)}
                >
                  {company}
                </button>
              ))}
            </div>
            <div className="b2bws-stack">
              {queue.map((entry) => (
                <article key={entry.id} className="b2bws-panel">
                  <div className="b2bws-card-meta">
                    <span className="b2bws-score"><Network size={16} />{entry.score}% intro confidence</span>
                    <span className="b2bws-pill">{entry.connectorType}</span>
                  </div>
                  <div className="b2bws-card-copy">
                    <h3>{entry.candidate} → {entry.company}</h3>
                    <p>{entry.role} · {entry.connector}</p>
                    <p>{entry.trustNote}</p>
                  </div>
                  <div className="b2bws-card-meta">
                    {entry.skills.map((skill) => (
                      <span key={skill} className="b2bws-mini">{skill}</span>
                    ))}
                    <span className="b2bws-mini">{entry.status}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="b2bws-panel">
            <span className="b2bws-kicker">intro brief</span>
            <h2>{topEntry ? `${topEntry.candidate} for ${topEntry.company}` : "No queue items yet"}</h2>
            {topEntry ? (
              <>
                <div className="b2bws-score"><Radar size={16} />{topEntry.score}% best current path</div>
                <ul className="b2bws-bullets">
                  <li><span className="b2bws-bullet-dot" /><span><strong>Connector:</strong> {topEntry.connector} · {topEntry.connectorType}</span></li>
                  <li><span className="b2bws-bullet-dot" /><span><strong>Why this path:</strong> {topEntry.trustNote}</span></li>
                  <li><span className="b2bws-bullet-dot" /><span><strong>Next step:</strong> {topEntry.nextStep}</span></li>
                </ul>
                <Button variant="outline" onClick={() => setActiveTab("status")}>
                  Track status loop
                  <ArrowRight />
                </Button>
              </>
            ) : (
              <div className="b2bws-empty">No warm intros match this company filter yet.</div>
            )}
          </section>
        </div>
      ) : null}

      {activeTab === "status" ? (
        <section className="b2bws-panel">
          <span className="b2bws-kicker">status loop</span>
          <h2>Referrals should not disappear after the send.</h2>
          <div className="b2bws-stage-grid">
            {stages.map((stage) => (
              <article key={stage.label} className="b2bws-stage">
                <div className="b2bws-card-meta">
                  <span className="b2bws-stage-label">{stage.label}</span>
                  <span className="b2bws-score">{stage.items.length}</span>
                </div>
                <ul className="b2bws-bullets">
                  {stage.items.map((entry) => (
                    <li key={entry.id}>
                      <span className="b2bws-bullet-dot" />
                      <span className="b2bws-stage-copy">{entry.candidate} · {entry.company}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "rewards" ? (
        <div className="b2bws-grid">
          <section className="b2bws-panel">
            <span className="b2bws-kicker">connector leaderboard</span>
            <h2>Reward the people creating real hiring movement.</h2>
            <div className="b2bws-list">
              {leaders.map((leader) => (
                <div key={leader.connector} className="b2bws-row">
                  <div className="b2bws-card-copy">
                    <h3>{leader.connector}</h3>
                    <p>{leader.intros} active introductions</p>
                  </div>
                  <span className="b2bws-score"><HandCoins size={16} />{leader.rewards} coins</span>
                </div>
              ))}
            </div>
          </section>
          <section className="b2bws-panel">
            <span className="b2bws-kicker">reward logic</span>
            <h2>What the referrer side should reinforce</h2>
            <ul className="b2bws-bullets">
              <li><span className="b2bws-bullet-dot" /><span>Credible intro sent with the right candidate brief.</span></li>
              <li><span className="b2bws-bullet-dot" /><span>Warm path generates a real recruiter or hiring-manager response.</span></li>
              <li><span className="b2bws-bullet-dot" /><span>Closed-loop feedback helps the next candidate get sharper.</span></li>
            </ul>
          </section>
        </div>
      ) : null}
    </B2BWorkspaceShell>
  )
}
