import type { Metadata } from "next"
import { GrowthCommand } from "@/components/growth/growth-command"
import "./growth-command.css"

export const metadata: Metadata = {
  title: "Distribution Tracker | Myro",
  description: "Private publishing and voice-learning workstation for Myro.",
}

export default function GrowthCommandPage() {
  return <GrowthCommand />
}
