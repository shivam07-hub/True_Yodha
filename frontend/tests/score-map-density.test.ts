import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")

test("Score map sits the domain list beside the radar instead of under a padded void", () => {
  const page = read("app/(authed)/skills/page.tsx")
  const css = read("app/(authed)/skills/score-map.css")

  assert.match(page, /className="sm-radar-body"/)
  assert.match(css, /\.sm-radar-body\s*\{/)
  assert.match(css, /grid-template-columns:\s*minmax\(240px, 280px\) minmax\(0, 1fr\)/)
  assert.doesNotMatch(css, /min-height:\s*330px/)
  assert.doesNotMatch(css, /min-height:\s*280px/)
  assert.doesNotMatch(css, /min-height:\s*245px/)
  assert.doesNotMatch(css, /min\(100%, 430px\)/)
  assert.match(css, /\.sm-radar-wrap svg[\s\S]*?max-width:\s*280px/)
})

test("Radar domain labels are readable pickers with keyboard hit targets", () => {
  const radar = read("components/skills/domain-radar.tsx")
  const css = read("app/(authed)/skills/score-map.css")

  assert.doesNotMatch(radar, /tm-text-faint/)
  assert.doesNotMatch(radar, /opacity=\{activeDomain && !isActive \? 0\.4/)
  assert.match(radar, /role=\{pickable \? "button"/)
  assert.match(radar, /tabIndex=\{pickable \? 0/)
  assert.match(radar, /aria-label=\{pickable \? domain/)
  assert.match(radar, /aria-pressed=\{pickable \? isActive/)
  assert.match(radar, /className="dr-hit"/)
  assert.match(radar, /LABEL_GUTTER = 36/)
  assert.match(radar, /fontSize="11"/)
  assert.match(radar, /fill=\{isActive \? "var\(--data-1\)" : "var\(--tm-text\)"\}/)
  assert.match(css, /\.dr-hit:focus-visible \.dr-focus-ring/)
})

test("Skill chips and the band line read as clickable facts, not captions", () => {
  const page = read("app/(authed)/skills/page.tsx")
  const css = read("app/(authed)/skills/score-map.css")
  const band = read("components/skills/band-percentile-line.tsx")

  assert.match(page, /className="sm-band"/)
  assert.match(css, /\.sm-skill-chips a[\s\S]*?min-height:\s*36px/)
  assert.match(css, /\.sm-skill-chips a[\s\S]*?border-radius:\s*8px/)
  assert.match(css, /\.sm-hero-copy[\s\S]*?color:\s*var\(--tm-text\)/)
  assert.match(css, /\.sm-focus-meta[\s\S]*?color:\s*var\(--tm-text\)/)
  assert.match(css, /\.sm-eyebrow[\s\S]*?color:\s*var\(--tm-text-muted\)/)
  assert.match(band, /const styled = !className/)
})
