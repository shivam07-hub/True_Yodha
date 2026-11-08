import type { Metadata } from "next"
import { DeleteAccount } from "./delete-account"

const BASE = "https://www.himyro.com"

export const metadata: Metadata = {
  title: "Delete your account — Myro",
  description: "Delete your Myro account, CVs, and the activity stored on it.",
  alternates: { canonical: `${BASE}/account/delete` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Delete your account — Myro",
    description: "Delete your Myro account, CVs, and the activity stored on it.",
    type: "website",
    url: `${BASE}/account/delete`,
  },
}

export default function DeleteAccountPage() {
  return <DeleteAccount />
}
