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

test("first-run header shows kept count instead of a meter", () => {
  const markup = renderToStaticMarkup(
    <PlaygroundHeader
      variant="master"
      brandLabel="Myro"
      masterMeta="Your CV · 1 of 2"
      jobTitle=""
      company="Untitled company"
      reqCount={0}
      ready={0}
      delta={0}
      canApply
      applyHint="Confirm these skills"
      saveState=""
      primaryLabel="Looks right →"
      hideScore
      hideBack
      hideOverflow
      statusValue={20}
      scoreCaption="kept"
      onBack={() => {}}
      onReqPill={() => {}}
      onApply={() => {}}
      onDownload={() => {}}
    />,
  )

  assert.match(markup, /Your CV · 1 of 2/)
  assert.match(markup, />20<\/span>/)
  assert.match(markup, /kept/)
  assert.match(markup, /Looks right →/)
  assert.doesNotMatch(markup, /\/100/)
  assert.doesNotMatch(markup, /cvb-v2-score-bar/)
  assert.doesNotMatch(markup, /cvb-v2-crumb/)
})
