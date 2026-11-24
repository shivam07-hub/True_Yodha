"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"

type State = "idle" | "copied" | "selected"

const LABEL: Record<State, string> = { idle: "Copy", copied: "Copied", selected: "Selected" }

/** The connector address with one Copy control. In-app browsers (Instagram,
 *  LinkedIn, our Android app) often refuse clipboard writes; then the address
 *  is selected instead, so a long-press or Ctrl+C finishes the copy. */
export function CopyAddress({ address }: { address: string }) {
  const [state, setState] = useState<State>("idle")
  const valueRef = useRef<HTMLElement>(null)

  function settle(next: State) {
    setState(next)
    window.setTimeout(() => setState("idle"), 2400)
  }

  function select() {
    const node = valueRef.current
    const selection = window.getSelection()
    if (!node || !selection) return
    const range = document.createRange()
    range.selectNodeContents(node)
    selection.removeAllRanges()
    selection.addRange(range)
    settle("selected")
  }

  function copy() {
    if (!navigator.clipboard) {
      select()
      return
    }
    navigator.clipboard.writeText(address).then(() => settle("copied"), select)
  }

  return (
    <div className="ai-address">
      <span className="ai-address-label" id="ai-address-label">Connector address</span>
      <code ref={valueRef} className="ai-address-value" aria-labelledby="ai-address-label">{address}</code>
      <Button variant="outline" size="sm" onClick={copy} aria-live="polite">
        {LABEL[state]}
      </Button>
    </div>
  )
}
