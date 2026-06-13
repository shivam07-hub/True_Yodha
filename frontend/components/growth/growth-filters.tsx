"use client"

import type { GrowthMessage } from "@/lib/api"

export interface GrowthFilterState {
  channel: string
  status: string
  format: string
}

interface Props {
  value: GrowthFilterState
  messages: GrowthMessage[]
  onChange: (value: GrowthFilterState) => void
  onExport: () => void
  onImport: (file: File) => void
  importing: boolean
}

function options(messages: GrowthMessage[], key: "channel" | "status" | "format") {
  if (key === "status") return ["draft", "posted", "paused"]
  return Array.from(
    new Set(
      messages
        .map((message) => message[key])
        .filter(Boolean) as string[],
    ),
  ).sort()
}

export function GrowthFilters({
  value,
  messages,
  onChange,
  onExport,
  onImport,
  importing,
}: Props) {
  const fields: Array<{
    key: keyof GrowthFilterState
    label: string
    values: string[]
  }> = [
    { key: "channel", label: "Platform", values: options(messages, "channel") },
    { key: "status", label: "Status", values: options(messages, "status") },
    { key: "format", label: "Type", values: options(messages, "format") },
  ]

  return (
    <div className="gc-filters" aria-label="Distribution filters">
      {fields.map((field) => (
        <label key={field.key}>
          <span>{field.label}</span>
          <select
            value={value[field.key]}
            onChange={(event) =>
              onChange({ ...value, [field.key]: event.target.value })
            }
          >
            <option value="all">All</option>
            {field.values.map((option) => (
              <option key={option} value={option}>
                {option.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      ))}
      <span className="gc-filter-spacer" />
      <button type="button" className="gc-tool-button" onClick={onExport}>
        ↓ Save snapshot
      </button>
      <label className="gc-tool-button">
        {importing ? "Loading..." : "↑ Load snapshot"}
        <input
          type="file"
          accept="application/json"
          disabled={importing}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onImport(file)
            event.target.value = ""
          }}
        />
      </label>
    </div>
  )
}
