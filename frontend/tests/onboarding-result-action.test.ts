import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const frontendRoot = process.cwd()
const read = (path: string) => readFileSync(join(frontendRoot, path), "utf8")

test("the first shortlist is a single-selection decision surface", () => {
  const matches = read("components/onboarding/result-matches.tsx")

  assert.match(matches, /role="radiogroup"/)
  assert.match(matches, /type="radio"/)
  assert.match(matches, /onSelect\(job\.job_id\)/)
  assert.doesNotMatch(matches, /saveJob|Tailor CV|See every match/)
})

test("the final step persists one role before offering tailoring", () => {
  const result = read("components/onboarding/full-result.tsx")
  const success = read("components/onboarding/first-role-success.tsx")

  assert.match(result, /onboarding\.commitFirstRole/)
  assert.match(result, /Save \$\{selectedJob\.title\} at \$\{selectedJob\.company/)
  assert.match(result, /receipt\.tailor_href/)
  assert.match(success, /Tailor my CV for this role/)
  assert.match(success, /tailorHref/)
  assert.doesNotMatch(result, /savedCount|pickBestMatch|See all matches/)
})

test("failed persistence keeps the selection and shows an adjacent retry", () => {
  const result = read("components/onboarding/full-result.tsx")

  assert.match(result, /setError\(/)
  assert.match(result, /role="alert"/)
  assert.doesNotMatch(result, /setSelectedJobId\(null\)/)
})

test("match fit and reasons remain grounded in canonical match data", () => {
  const matches = read("components/onboarding/result-matches.tsx")

  assert.match(matches, /matchFitScore\(job\)/)
  assert.match(matches, /verdictLabel\(job\.verdict\)/)
  assert.match(matches, /job\.matched_skills \?\? \[\]/)
})

test("an empty shortlist has exactly one recovery action", () => {
  const result = read("components/onboarding/full-result.tsx")

  assert.match(result, /No live roles match this direction yet/)
  assert.match(result, /Adjust my direction/)
  assert.match(result, /onAdjust\(\)/)
  assert.doesNotMatch(result, /ready in the market/)
})

test("the shortlist is target-scoped by construction, not by cache key", () => {
  const result = read("components/onboarding/full-result.tsx")

  // This used to be a client fetch of `jobs.matches` keyed on the context hash.
  // That key kept the CACHE honest but not the DATA: `jobs.matches` is the
  // direction-blind durable stack, so after a direction change the previous
  // direction's cards were still what came back, and `commit_first_role`
  // rejected the click with "Choose a role from your current shortlist."
  // The server now scopes the shortlist, so the component cannot show a card the
  // save would refuse — provided it never reaches for the stack again.
  // Asserted on the import and the call, not on prose: the docstring above
  // names `jobs.matches` to explain the bug, and `useQueryClient` (still used,
  // for cache invalidation after a save) contains "useQuery".
  assert.match(result, /result\.shortlist\b/)
  assert.doesNotMatch(result, /import \{[^}]*\bjobs\b[^}]*\} from "@\/lib\/api"/)
  assert.doesNotMatch(result, /\buseQuery\(/)
})

test("every non-ready shortlist status renders its own state", () => {
  const result = read("components/onboarding/full-result.tsx")

  // An empty list is four different situations. Rendering one blank for all of
  // them is how a lost match run looked identical to a market with no overlap.
  assert.match(result, /shortlist_status === "computing"/)
  assert.match(result, /shortlist_status === "stalled"/)
  assert.match(result, /This is taking longer than it should/)
  assert.match(result, /No live roles match this direction yet/)
})

test("a failed result fetch stops loading and offers a retry", () => {
  // The fetch moved up to the page, so its failure branch has to live there too
  // — a status the component can no longer see must still reach the user.
  const page = read("app/onboarding/result/page.tsx")

  assert.match(page, /result\.isError/)
  assert.match(page, /Couldn&apos;t load your next step/)
  assert.match(page, /result\.refetch\(\)/)
})
