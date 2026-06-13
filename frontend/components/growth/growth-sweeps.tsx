"use client"

import { useState } from "react"
import type { GrowthSeedingSweep } from "@/lib/api"

export function GrowthSweeps({ sweeps }: { sweeps: GrowthSeedingSweep[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = sweeps.find((sweep) => sweep.id === selectedId) ?? null

  return (
    <section className="gc-tab-panel">
      <div className="gc-hint">
        Weekly seeding sweeps. Open one to read the full opportunity context,
        suggested responses, and tone checks.
      </div>
      <div className="gc-issue-grid">
        {sweeps.map((sweep) => (
          <button
            type="button"
            className="gc-issue-card gc-sweep-card"
            key={sweep.id}
            onClick={() => setSelectedId(sweep.id)}
          >
            <h2>{sweep.sweep_date}</h2>
            <p>{sweep.summary || "Seeding sweep"}</p>
            <span>Read Seeding sweep →</span>
          </button>
        ))}
      </div>
      {selected ? (
        <article className="gc-sweep-document">
          <button
            type="button"
            aria-label="Close seeding sweep"
            onClick={() => setSelectedId(null)}
          >
            Close
          </button>
          <h2>{selected.title}</h2>
          <pre>{selected.body}</pre>
        </article>
      ) : null}
      {sweeps.length === 0 ? (
        <div className="gc-empty">No seeding sweeps have been imported.</div>
      ) : null}
    </section>
  )
}
