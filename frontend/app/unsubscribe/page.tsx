import type { Metadata } from "next"

import { UnsubscribeButton } from "./unsubscribe-button"
import "./unsubscribe.css"

export const metadata: Metadata = {
  title: "Unsubscribe — Myro",
  robots: { index: false, follow: false },
}

// Entered from the golden-list digest's footer link (#59). The token is the
// proof, so there is no login. Nothing happens on load: link scanners open
// every URL in an email, and a scanner must not take anyone off the list.
export default function UnsubscribePage({ searchParams }: { searchParams: { t?: string } }) {
  const token = typeof searchParams.t === "string" ? searchParams.t : ""
  return (
    <main className="unsub-page">
      <h1 className="unsub-title">Stop Myro&apos;s job emails?</h1>
      <UnsubscribeButton token={token} />
    </main>
  )
}
