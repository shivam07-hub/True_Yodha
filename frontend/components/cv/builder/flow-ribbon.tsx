/**
 * FlowRibbon — the CV workspace nav. Replaces the old CV/Stories/Memory pill:
 * the three tabs ARE the product story (dump your past -> Myro understands
 * you -> tailor per job), so the nav says that instead of naming components.
 */
"use client"

import Link from "next/link"
import { I, LIcon } from "./library-icons"

type View = "cv" | "stories" | "memory"

const STEPS: { n: string; title: string; sub: string; view: View }[] = [
  { n: "1", title: "Dump your past", sub: "Stories", view: "stories" },
  { n: "2", title: "Myro understands you", sub: "Memory", view: "memory" },
  { n: "3", title: "Tailor per job", sub: "CV", view: "cv" },
]

export function FlowRibbon({ view }: { view: View }) {
  return (
    <div className="tm-flow-ribbon">
      <div className="tm-flow-steps" role="tablist" aria-label="CV workspace steps">
        {STEPS.map((step) => {
          const on = step.view === view
          const href = step.view === "cv" ? "/cv?view=cv" : `/cv?view=${step.view}`
          return (
            <Link
              key={step.view}
              href={href}
              className={`tm-flow-step${on ? " active" : ""}`}
              role="tab"
              aria-selected={on}
            >
              <span className="tm-flow-step-num">{step.n}</span>
              <span className="tm-flow-step-text">
                <span className="tm-flow-step-title">{step.title}</span>
                <span className="tm-flow-step-sub">{step.sub}</span>
              </span>
            </Link>
          )
        })}
      </div>
      <Link href="/cv?view=stories&dump=1" className="tm-flow-add">
        <LIcon d={I.plus} size={15}/> Add your past
      </Link>
    </div>
  )
}
