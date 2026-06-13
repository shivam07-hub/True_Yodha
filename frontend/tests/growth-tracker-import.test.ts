import test from "node:test"
import assert from "node:assert/strict"

import {
  buildLegacyImport,
  extractArrayLiteral,
} from "../../scripts/import-growth-tracker"

const FIXTURE = `
<script>
const HIM = "https://www.himyro.com/newsletter/";
const u = (slug,src,camp,content)=>\`\${HIM}\${slug}?utm_source=\${src}&utm_medium=social&utm_campaign=\${camp}&utm_content=\${content}\`;
const POSTINGS = [
  {
    id:"p1", date:"2026-06-10", platform:"LinkedIn", type:"Post",
    title:"CV proof [without fake numbers]",
    himyro:u("2026-06-cv-proof","linkedin","cv-proof","founder-post"),
    campaign:"cv-proof", status:"draft", copy:\`Draft with ] inside a template.\`
  },
  {
    id:"p2", date:"2026-06-11", platform:"Reddit", type:"Response",
    title:"Interview answer", himyro:"https://www.reddit.com/r/jobs/1",
    channel:"https://www.reddit.com/r/jobs/1",
    campaign:"interview-help", status:"posted", copy:"Original response"
  }
];
const ISSUES = [
  {n:"008",title:"CV proof",slug:"2026-06-cv-proof",pts:"Evidence-led CV bullets"}
];
const SWEEP_CONTENT = {
  "2026-06-10": "# Sweep\\n\\nFull opportunity context."
};
const SWEEPS = [
  {key:"2026-06-10",date:"2026-06-10",pts:"India-first opportunities"}
];
</script>`

test("balanced array extraction ignores closing brackets inside templates", () => {
  const literal = extractArrayLiteral(FIXTURE, "POSTINGS")

  assert.match(literal, /Draft with \] inside a template/)
  assert.match(literal, /id:"p2"/)
})

test("legacy import preserves overrides, URLs, status, and manual metrics", () => {
  const overrides = {
    p1: { draftEdit: "Edited founder copy", status: "paused" },
    p2: {
      posted: "Exact live copy",
      liveUrl: "https://www.reddit.com/r/jobs/comments/1/reply/2",
      impressions: 420,
      clicks: 17,
    },
  }

  const payload = buildLegacyImport(FIXTURE, overrides)

  assert.equal(payload.messages.length, 2)
  assert.equal(payload.sweeps.length, 1)
  assert.equal(payload.sweeps[0].body, "# Sweep\n\nFull opportunity context.")
  assert.equal(
    (payload.messages[0].metadata as Record<string, unknown>).prepared_draft,
    "Draft with ] inside a template.",
  )
  assert.equal(payload.messages[0].draft_copy, "Edited founder copy")
  assert.equal(payload.messages[0].status, "paused")
  assert.match(String(payload.messages[0].utm_url), /utm_source=linkedin/)
  assert.equal(payload.messages[1].final_copy, "Exact live copy")
  assert.equal(payload.messages[1].status, "published")
  assert.equal(payload.publications[0].final_copy_snapshot, "Exact live copy")
  const outcome = payload.publications[0].outcome as Record<string, unknown>
  assert.equal(outcome.impressions, 420)
  assert.equal(outcome.clicks, 17)
  assert.equal(
    payload.publications[0].live_url,
    "https://www.reddit.com/r/jobs/comments/1/reply/2",
  )
})

test("legacy identifiers are deterministic across repeated dry runs", () => {
  const first = buildLegacyImport(FIXTURE, {})
  const second = buildLegacyImport(FIXTURE, {})

  assert.deepEqual(
    first.messages.map((message) => message.id),
    second.messages.map((message) => message.id),
  )
  assert.equal(
    first.assets.find((asset) => asset.slug === "2026-06-cv-proof")?.canonical_url,
    "https://www.himyro.com/newsletter/2026-06-cv-proof",
  )
})
