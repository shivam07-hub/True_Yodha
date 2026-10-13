"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { emailPrefs } from "@/lib/api"

type State = "idle" | "working" | "done" | "invalid"

export function UnsubscribeButton({ token }: { token: string }) {
  const [state, setState] = useState<State>(token ? "idle" : "invalid")

  if (state === "done") return <p className="unsub-line" role="status">Done. No more job emails.</p>
  if (state === "invalid") return <p className="unsub-line" role="alert">This link has expired.</p>

  return (
    <Button
      variant="solid"
      loading={state === "working"}
      onClick={async () => {
        setState("working")
        try {
          await emailPrefs.unsubscribe(token)
          setState("done")
        } catch {
          setState("invalid")
        }
      }}
    >
      Unsubscribe
    </Button>
  )
}
