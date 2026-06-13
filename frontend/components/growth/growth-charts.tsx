"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { GrowthMessage } from "@/lib/api"

const CHANNEL_COLORS: Record<string, string> = {
  linkedin: "#2563eb",
  x: "#475569",
  reddit: "#f59e0b",
  telegram_discord: "#8b5cf6",
  whatsapp: "#10b981",
  hacker_news: "#ef4444",
}

const STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  posted: "#10b981",
  paused: "#ef4444",
}

function displayStatus(status: string): "draft" | "posted" | "paused" {
  if (status === "published" || status === "posted") return "posted"
  if (status === "paused") return "paused"
  return "draft"
}

export function GrowthCharts({ messages }: { messages: GrowthMessage[] }) {
  const platforms = Array.from(new Set(messages.map((message) => message.channel)))
    .map((channel) => ({
      channel,
      label: channel.replaceAll("_", "/"),
      count: messages.filter((message) => message.channel === channel).length,
      fill: CHANNEL_COLORS[channel] ?? "#94a3b8",
    }))
  const statuses = (["draft", "posted", "paused"] as const).map((status) => ({
    status,
    count: messages.filter(
      (message) => displayStatus(message.status) === status,
    ).length,
    fill: STATUS_COLORS[status],
  }))

  return (
    <div className="gc-charts">
      <section className="gc-card gc-chart-card">
        <h2>Items by platform</h2>
        <div className="gc-chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={platforms} margin={{ top: 8, right: 12, left: -24, bottom: 0 }}>
              <CartesianGrid stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {platforms.map((item) => (
                  <Cell key={item.channel} fill={item.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="gc-card gc-chart-card">
        <h2>Pipeline by status</h2>
        <div className="gc-chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={statuses}
                dataKey="count"
                nameKey="status"
                innerRadius={52}
                outerRadius={82}
                paddingAngle={2}
              >
                {statuses.map((item) => (
                  <Cell key={item.status} fill={item.fill} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}
