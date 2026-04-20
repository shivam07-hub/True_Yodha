"use client"

import { useState } from "react"

const TARGET_ROLES = [
  "Data Scientist",
  "Data Analyst",
  "Machine Learning Engineer",
  "Data Engineer",
  "AI/ML Researcher",
  "Business Intelligence Analyst",
  "Product Analyst",
  "Software Engineer",
  "Backend Engineer",
  "Full Stack Engineer",
  "DevOps / Platform Engineer",
  "Cloud Architect",
  "Solutions Architect",
  "Product Manager",
  "Strategy & Operations",
]

interface Props {
  onNext: (role: string, location: string) => void
  loading: boolean
}

export function StepRole({ onNext, loading }: Props) {
  const [role, setRole] = useState("")
  const [location, setLocation] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!role || !location.trim()) return
    onNext(role, location.trim())
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">What role are you targeting?</h2>
        <p className="text-sm text-muted-foreground">
          We will match your CV to live jobs in your market
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="role">Target role</label>
          <select
            id="role"
            required
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="border border-input rounded-md px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="" disabled>Select a role…</option>
            {TARGET_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="location">Location</label>
          <input
            id="location"
            type="text"
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Mumbai, India"
            className="border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !role || !location.trim()}
          className="mt-2 bg-primary text-primary-foreground rounded-md px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "Analysing your CV…" : "Get my Mirror Score →"}
        </button>
      </form>
    </div>
  )
}