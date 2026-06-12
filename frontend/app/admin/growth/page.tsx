import type { Metadata } from "next"
import { GrowthCommand } from "@/components/growth/growth-command"
import "./growth-command.css"

export const metadata: Metadata = {
  title: "Growth Command | Myro",
  description: "Private editorial and distribution command center for Myro.",
}

export default function GrowthCommandPage() {
  return <GrowthCommand />
}
