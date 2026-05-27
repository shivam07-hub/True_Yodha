import type { Metadata } from "next"
import { DocsPage } from "@/components/docs/docs-page"

export const metadata: Metadata = {
  title: "How Myro Works | Methodology & Documentation",
  description:
    "Plain-English explanation of how Myro reads your CV, calculates your Myro Score, finds matching jobs, and maps your skills across 10 career domains.",
  openGraph: {
    title: "How Myro Works | Methodology & Documentation",
    description:
      "No black boxes. See exactly how your CV is read, how your score is calculated, and how job matches are found.",
    url: "https://www.himyro.com/docs",
  },
}

export default function Docs() {
  return <DocsPage />
}
