import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Phone — Myro",
  robots: { index: false, follow: false },
}

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return children
}
