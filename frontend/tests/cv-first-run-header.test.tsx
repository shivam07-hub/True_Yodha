import assert from "node:assert/strict"
import test from "node:test"

import { renderToStaticMarkup } from "react-dom/server"

import { PlaygroundHeader } from "../components/cv/builder/playground-header"

function render(primaryBanner: boolean): string {
  return renderToStaticMarkup(
    <PlaygroundHeader
      variant="master"
      jobTitle=""
      company="Untitled company"
      reqCount={0}
      ready={0}
      delta={0}
      canApply
      applyHint="Back to your CV library"
      saveState=""
      primaryLabel="Done"
      primaryBanner={primaryBanner}
      onBack={() => {}}
      onReqPill={() => {}}
      onApply={() => {}}
      onDownload={() => {}}
    />,
  )
}

test("first-run CV completion action renders as a full-width banner", () => {
  const markup = render(true)

  assert.match(markup, /cvb-v2-head--banner/)
  assert.match(markup, /cvb-v2-applybtn--banner/)
  assert.match(markup, />Done<\/button>/)
})

test("ordinary CV header keeps its compact action", () => {
  const markup = render(false)

  assert.doesNotMatch(markup, /cvb-v2-head--banner/)
  assert.doesNotMatch(markup, /cvb-v2-applybtn--banner/)
})
