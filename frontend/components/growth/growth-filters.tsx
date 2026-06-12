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
}

function options(messages: GrowthMessage[], key: "channel" | "status" | "format") {
  return Array.from(
    new Set(messages.map((message) => message[key]).filter(Boolean) as string[]),
  ).sort()
}

export function GrowthFilters({ value, messages, onChange }: Props) {
  const fields: Array<{
    key: keyof GrowthFilterState
    label: string
    values: string[]
  }> = [
    { key: "channel", label: "Platform", values: options(messages, "channel") },
    { key: "status", label: "Status", values: options(messages, "status") },
    { key: "format", label: "Format", values: options(messages, "format") },
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
    </div>
  )
}
