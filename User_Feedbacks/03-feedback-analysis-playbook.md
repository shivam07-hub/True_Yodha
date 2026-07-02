# Myro Beta Feedback Analysis Playbook

This playbook is designed for optional feedback from prospective interns and
other early users. It keeps product research separate from hiring decisions.
Feedback submission is not a required selection task.

## Research question

The primary question is:

> Can a first-time job seeker reach, understand, trust, and act on a useful
> Myro result within 30 minutes on their normal device and connection?

Secondary questions:

- What prevents users from reaching the first useful result?
- Which results feel relevant, inaccurate, or difficult to trust?
- What makes someone expect to return?
- Which product qualities should remain unchanged?
- How do results differ by device, connection, and role stream?

This cohort may include prospective interns, not a representative sample of all
job seekers. Treat percentages as cohort evidence, not universal market truth.

## Stage 1 - Protect identities

1. Keep the raw form export in an access-controlled system outside Git.
2. Assign each response a random research ID such as `B2-0001`.
3. Remove name, email, application ID, CV content, file links, and accidental
   personal information.
4. Redact screenshots before they enter an analysis workspace.
5. Keep the identity-to-research-ID mapping separate from the research data.
6. Use only de-identified text with AI-assisted coding tools.
7. Commit only aggregate findings, sanitized quotations, and product evidence.

Product analysts do not need candidate identity. Internship reviewers should use
application materials, interviews, and role-relevant portfolio evidence, not
whether someone completed optional Myro feedback.

## Stage 2 - Check data quality

Mark a submitted response `analysis_eligible = false` when:

- the participant did not attempt or review any part of the product;
- the response contains no first-hand observation;
- most fields are empty or meaningless;
- it is a clear duplicate submission; or
- the response is copied from another candidate.

Do not exclude a response merely because the candidate was blocked early,
disliked Myro, wrote briefly, or did not produce a polished solution.

Report the total received, eligible, excluded, duplicate, and blocked counts.

## Stage 3 - Create the codebook

Assign codes to the observed problem, not only the candidate's proposed
solution.

### Product area

- Landing and positioning
- Signup and authentication
- CV upload and processing
- Myro Score and explanation
- CV Hub and versions
- CV tailoring and editing
- Skills and Forge
- Jobs and matching
- Intel
- Tracker
- Diary
- Settings and feedback
- Mobile layout and interaction
- Performance and reliability
- Trust, privacy, and methodology
- Cross-product navigation

### Journey stage

- Discover
- Understand
- Sign up
- Upload
- Wait for processing
- Reach first result
- Interpret result
- Choose an action
- Complete an action
- Return

### Signal type

- Value or praise
- Confusion
- Usability problem
- Functional bug
- Performance problem
- Inaccurate or irrelevant result
- Trust or privacy concern
- Missing capability
- Return trigger
- Preservation request

### Severity

| Level | Definition | Examples |
|---|---|---|
| Blocker | User cannot reach or continue the core flow | Signup failure, CV upload never completes, no result |
| Major | Core result is reached but cannot be trusted or acted on | Unexplained score, irrelevant matches, lost CV changes |
| Moderate | Task is possible with meaningful confusion or extra effort | Hidden navigation, unclear labels, poor mobile controls |
| Minor | Local friction with limited effect on task completion | Small copy issue, spacing problem, optional control confusion |

Severity describes user impact. Priority is decided later.

### Evidence quality

| Level | Definition |
|---|---|
| Strong | Exact steps, expected and actual result, environment, and supporting evidence |
| Usable | Specific first-hand observation with enough context to understand it |
| Weak | General opinion without a concrete moment |

### Resolution state

- New
- Reproduced
- Duplicate of known issue
- Already fixed
- Cannot reproduce
- Expected behavior but poorly explained
- Product decision required
- Out of current scope

## Stage 4 - Calibrate before coding everything

1. Two analysts independently code the same first 50 eligible responses.
2. Compare product area, journey stage, signal type, severity, and evidence
   quality.
3. Resolve disagreements and update code definitions with examples.
4. Code the remaining responses in batches.
5. Double-code a random 10% sample.
6. Recalibrate when agreement drops below 80% on any primary code.

AI may suggest codes after de-identification, but a human must verify blockers,
major issues, quotations, and recommendations.

## Stage 5 - Measure the cohort

Always report counts and percentages together.

### Core funnel measures

- Assignment submissions received
- Analysis-eligible responses
- Completed, partial, and blocked sessions
- Users who reached a useful result
- Time-to-value distribution
- Areas explored

### Experience measures

For every 1-5 rating, report:

- median;
- mean;
- percentage rating 1 or 2;
- percentage rating 4 or 5; and
- response count.

Do not report only a combined average. Trust and relevance can move in
different directions.

### Segments

Compare only segments large enough to interpret responsibly:

- mobile versus laptop or desktop;
- Wi-Fi versus mobile data;
- completed versus blocked sessions;
- time-to-value band;
- role stream; and
- major browser or operating-system groups.

Suppress percentages for segments with fewer than 20 eligible responses. Show
the raw count and mark the segment as directional.

## Stage 6 - Consolidate themes

Create one theme record for each distinct user problem.

| Field | Meaning |
|---|---|
| `theme_id` | Stable identifier such as `CV-UPLOAD-01` |
| `problem_statement` | User-centered description of what happens |
| `product_area` | Primary product area |
| `journey_stage` | Stage where the problem occurs |
| `signal_type` | Primary signal |
| `severity` | Highest validated impact |
| `affected_count` | Eligible responses containing the theme |
| `affected_share` | Affected count divided by eligible responses |
| `segments` | Groups where the signal is concentrated |
| `evidence_quality` | Strongest and typical evidence level |
| `representative_quote` | Sanitized quotation with permission |
| `reproduction` | Confirmed steps when applicable |
| `known_status` | Resolution state |
| `recommendation` | Next product or research action |

Keep contradictory evidence visible. For example, if some users find
gamification motivating and others find it stressful, report both groups and
the conditions around each response.

## Stage 7 - Prioritize

Apply these gates in order:

1. **Immediate escalation:** privacy exposure, security risk, destructive data
   loss, payment failure, or a core-flow outage.
2. **Core-flow blockers:** repeated signup, upload, processing, or first-result
   failures.
3. **Trust failures:** repeated inability to understand or believe scores,
   matches, or recommendations.
4. **Action failures:** users understand the result but cannot identify or
   complete the next step.
5. **Retention opportunities:** clear return triggers or preserved value that
   can strengthen the product loop.
6. **Feature requests:** consider only after identifying the underlying user
   problem and checking whether existing functionality already addresses it.

For non-emergency themes, assess:

- reach: how many eligible users experienced it;
- impact: blocker, major, moderate, or minor;
- funnel position: earlier failures receive more weight;
- confidence: evidence quality and reproducibility;
- strategic fit: alignment with Myro's CV-to-career-intelligence loop; and
- effort and risk: engineering, design, data, policy, and operational cost.

Do not turn the loudest requested solution directly into a roadmap item.
Participants are evidence about problems; the product team owns solution design.

## Stage 8 - Produce decisions

Each cohort report must end with:

- three findings to act on now;
- three findings to investigate;
- three strengths to preserve;
- issues already known or already fixed;
- product decisions that need Shivam's input;
- recommended experiments or engineering tickets;
- evidence that does not support action yet; and
- the date and owner of the next review.

Use the template in `reports/cohort-report-template.md`.

## Repository workflow

1. Store raw submissions outside Git.
2. Create a dated report from the template.
3. Add only sanitized evidence.
4. Link product recommendations to existing backlog items where possible.
5. Create a new issue only when the problem, evidence, acceptance boundary, and
   owner are clear.
6. Track whether a finding is accepted, shipped, rejected, or awaiting more
   evidence.
7. Tell participants what shipped from their feedback without exposing who
   reported it.
