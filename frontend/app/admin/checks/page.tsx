import type { Metadata } from "next"

import { ChecksDesk } from "@/components/review/checks-desk"

export const metadata: Metadata = {
  title: "Human Checks | Myro",
  description: "Reviewer desk for Apply Pack Human Checks.",
  robots: { index: false, follow: false },
}

export default function ChecksDeskPage() {
  return <ChecksDesk />
}
