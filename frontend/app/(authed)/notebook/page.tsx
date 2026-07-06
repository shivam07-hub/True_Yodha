import type { Metadata } from "next"
import { BrainDumpCanvas } from "@/components/notebook/brain-dump-canvas"

export const metadata: Metadata = {
  title: "Your notebook | Myro",
  description: "Write what you've done and what you want — Myro remembers it and turns it into CV bullets.",
  robots: { index: false, follow: false },
}

export default function NotebookPage() {
  return <BrainDumpCanvas />
}
