"use client"

import type { ReactNode } from "react"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import "./workspace-shell.css"

export interface WorkspaceMetric {
  label: string
  value: string
  hint: string
}

export interface WorkspaceTab {
  id: string
  label: string
  hint: string
}

interface WorkspaceAction {
  label: string
  onClick: () => void
}

interface B2BWorkspaceShellProps<T extends string> {
  eyebrow: string
  title: ReactNode
  subtitle: string
  metrics: WorkspaceMetric[]
  tabs: WorkspaceTab[]
  activeTab: T
  onTabChange: (tab: T) => void
  primaryAction: WorkspaceAction
  secondaryAction?: WorkspaceAction
  children: ReactNode
}

export function B2BWorkspaceShell<T extends string>({
  eyebrow,
  title,
  subtitle,
  metrics,
  tabs,
  activeTab,
  onTabChange,
  primaryAction,
  secondaryAction,
  children,
}: B2BWorkspaceShellProps<T>) {
  return (
    <div className="b2bws-page">
      <section className="b2bws-hero">
        <div className="b2bws-hero-copy">
          <span className="b2bws-eyebrow">{eyebrow}</span>
          <h1 className="b2bws-title">{title}</h1>
          <p className="b2bws-subtitle">{subtitle}</p>

          <div className="b2bws-actions">
            <Button size="lg" onClick={primaryAction.onClick}>
              {primaryAction.label}
              <ArrowRight />
            </Button>
            {secondaryAction ? (
              <Button size="lg" variant="outline" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            ) : null}
          </div>
        </div>

        <dl className="b2bws-metrics">
          {metrics.map((metric) => (
            <div key={metric.label} className="b2bws-metric">
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
              <p>{metric.hint}</p>
            </div>
          ))}
        </dl>
      </section>

      <div className="b2bws-tabs" role="tablist" aria-label="Workspace views">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className="b2bws-tab"
            data-active={activeTab === tab.id}
            onClick={() => onTabChange(tab.id as T)}
          >
            <span className="b2bws-tab-label">{tab.label}</span>
            <span className="b2bws-tab-hint">{tab.hint}</span>
          </button>
        ))}
      </div>

      <div className="b2bws-body">{children}</div>
    </div>
  )
}
