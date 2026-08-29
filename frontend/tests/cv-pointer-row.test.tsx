import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { CvLineRow } from "../components/cv/builder/cv-line-row"

test("a pointer row names the chevron and clamps the preview when collapsed", () => {
  const html = renderToStaticMarkup(
    <ul>
      <CvLineRow
        text="Led government relations across 12 markets and cut cycle time 40%."
        verdict={{ tone: "on-target", count: 0, offenders: [] }}
        verdictLabel="on target"
        pointer={{
          bodyId: "cvw-ptr-test",
          collapsed: true,
          onToggleCollapsed: () => {},
          dragHandle: <button type="button" className="cvw-drag" aria-label="Reorder pointer 1 of 2" />,
        }}
      />
    </ul>,
  )
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /aria-controls="cvw-ptr-test"/)
  assert.match(html, /Expand pointer/)
  assert.match(html, /is-collapsed/)
  assert.match(html, /on target/)
  assert.doesNotMatch(html, /cvb-pgc-ats-skills/)
})

test("an expanded pointer shows the full line and keeps the chevron a triangle", () => {
  const html = renderToStaticMarkup(
    <ul>
      <CvLineRow
        text="Led government relations across 12 markets and cut cycle time 40%."
        pointer={{
          bodyId: "cvw-ptr-open",
          collapsed: false,
          onToggleCollapsed: () => {},
        }}
      />
    </ul>,
  )
  assert.match(html, /aria-expanded="true"/)
  assert.match(html, /Collapse pointer/)
  assert.match(html, /chevron-down|polyline/)
})
