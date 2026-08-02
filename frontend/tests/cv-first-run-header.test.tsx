import assert from "node:assert/strict"
import test from "node:test"

import { renderToStaticMarkup } from "react-dom/server"

import { PlaygroundHeader } from "../components/cv/builder/playground-header"

function render(): string {
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
      onBack={() => {}}
      onReqPill={() => {}}
      onApply={() => {}}
      onDownload={() => {}}
    />,
  )
}

test("main CV keeps its completion action in the compact header", () => {
  const markup = render()

  assert.doesNotMatch(markup, /cvb-v2-head--banner/)
  assert.doesNotMatch(markup, /cvb-v2-applybtn--banner/)
  assert.match(markup, />Done<\/button>/)
})
