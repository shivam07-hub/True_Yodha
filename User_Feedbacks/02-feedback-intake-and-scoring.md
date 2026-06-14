# Beta Assignment Intake and Scoring

Use this schema in Google Forms, Tally, Typeform, Airtable, or another form tool
that can export one response per row.

## Form introduction

> This assignment evaluates how you observe, reason, prioritize, and
> communicate. We do not evaluate your CV, Myro Score, or whether your feedback
> is positive. Do not attach your CV. Remove personal information from any
> screenshot you submit.

## Section A - Candidate and session

| Field ID | Prompt | Type | Required |
|---|---|---|---|
| `application_email` | Email used for your internship application | Email | Yes |
| `role_stream` | Role or internship track applied for | Single select | Yes |
| `device_type` | Primary device used for this test | Mobile / laptop / desktop / tablet | Yes |
| `operating_system` | Operating system | Single select + other | Yes |
| `browser` | Browser used | Single select + other | Yes |
| `connection_type` | Connection used | Wi-Fi / mobile data / mixed / unknown | Yes |
| `session_outcome` | How far did you get? | Completed / partial / blocked before a result | Yes |
| `time_to_value` | Time until the first useful result | Under 5 / 5-10 / 11-20 / 21-30 minutes / no useful result | Yes |
| `areas_explored` | Which areas did you use? | Multi-select | Yes |

Suggested `areas_explored` options:

- Landing and signup
- CV upload
- CV analysis or Myro Score
- CV Hub or tailoring
- Skills or Forge
- Jobs or matches
- Intel
- Tracker
- Diary
- Settings or feedback
- Other

## Section B - Candidate assessment

### `product_understanding`

**Prompt:** In one or two sentences, what do you think Myro does, and who would
benefit from it most?

Type: long text. Required.

### `most_useful_moment`

**Prompt:** What was the most useful result or interaction? Explain why it
mattered to you as a job seeker.

Type: long text. Required.

### `biggest_problem_area`

**Prompt:** Where did your biggest problem occur?

Type: single select using the same product-area options as `areas_explored`.
Required.

### `biggest_problem`

**Prompt:** Describe the most confusing, inaccurate, slow, or frustrating
moment.

Type: long text. Required.

### `attempted_action`

**Prompt:** What were you trying to do?

Type: short text. Required.

### `expected_result`

**Prompt:** What did you expect to happen?

Type: long text. Required.

### `actual_result`

**Prompt:** What actually happened?

Type: long text. Required.

### `reproduction_steps`

**Prompt:** If this was a bug, list the shortest steps that reproduce it. Write
`Not a bug` when this does not apply.

Type: long text. Required.

### `priority_improvement`

**Prompt:** If the Myro team could make only one improvement, what should it
be?

Type: long text. Required.

### `priority_reason`

**Prompt:** Which user problem would this solve, and why should it be
prioritized over other improvements?

Type: long text. Required.

### `preserve`

**Prompt:** What is one part of Myro the team should preserve, and why?

Type: long text. Required.

### `return_trigger`

**Prompt:** Complete the sentence: "I would return to Myro when..."

Type: short text. Required.

## Section C - Ratings

Use a five-point linear scale where `1 = strongly disagree` and
`5 = strongly agree`.

| Field ID | Statement |
|---|---|
| `rating_next_step` | I understood what to do next. |
| `rating_trust` | I trusted the results shown to me. |
| `rating_relevance` | The results felt relevant to my career. |
| `rating_return` | I would use Myro again. |
| `rating_recommend` | I would recommend Myro to another job seeker. |

All rating fields are required.

## Section D - Optional evidence and consent

| Field ID | Prompt | Type | Required |
|---|---|---|---|
| `evidence_upload` | Optional redacted screenshot or sketch | File upload | No |
| `anything_else` | Is there anything important the questions did not capture? | Long text | No |
| `quote_permission` | May Myro use an anonymized quotation from your response in product research? | Yes / no | Yes |
| `privacy_confirmation` | I did not attach my CV and removed personal information from evidence. | Checkbox | Yes |
| `independent_work_confirmation` | These observations came from my own product session. | Checkbox | Yes |

The form should place the
[Privacy Policy](https://www.himyro.com/privacy) and
[Terms of Service](https://www.himyro.com/terms) beside the submission button.

## Export contract

The form platform will add `submitted_at` and a source response identifier.
Keep this column order when exporting:

```text
source_response_id,submitted_at,application_email,role_stream,device_type,
operating_system,browser,connection_type,session_outcome,time_to_value,
areas_explored,product_understanding,most_useful_moment,biggest_problem_area,
biggest_problem,attempted_action,expected_result,actual_result,
reproduction_steps,priority_improvement,priority_reason,preserve,
return_trigger,rating_next_step,rating_trust,rating_relevance,rating_return,
rating_recommend,evidence_upload,anything_else,quote_permission,
privacy_confirmation,independent_work_confirmation
```

Do not commit this export. Before research analysis, replace
`source_response_id` and `application_email` with a random `research_id`, then
remove both source identity fields.

## Hiring scorecard

Score only the written assessment. Do not open or inspect the candidate's CV,
Myro Score, skill levels, or job recommendations.

| Dimension | Weight | Strong evidence | Weak evidence |
|---|---:|---|---|
| Specific observation | 30 | Names exact actions, states, expectations, and outcomes | Generic statements such as "improve UI" |
| User understanding | 25 | Connects the moment to a real job-seeker need or constraint | Discusses personal taste without user impact |
| Prioritization | 25 | Chooses one material problem, explains trade-offs, proposes a feasible direction | Lists many features or jumps to an oversized solution |
| Clarity | 20 | Concise, structured, internally consistent, easy to explain | Vague, repetitive, contradictory, or copied-sounding |

### Score anchors

- `90-100`: exceptional evidence and judgment;
- `75-89`: strong response worth advancing;
- `60-74`: mixed evidence; review alongside the interview;
- below `60`: insufficient evidence from this assignment.

Do not use the total as an automatic rejection rule. A technical blocker can
limit what the candidate observed, and that blocker may itself be high-quality
evidence.

## Reviewer calibration

Before scoring all responses:

1. Two reviewers independently score the same first 10 responses.
2. Compare dimension scores and discuss differences greater than five points.
3. Agree on two or three examples for each score band.
4. Score the remaining responses with candidate identity hidden where
   operationally possible.
5. Double-score a random 10% sample to detect rubric drift.
6. Record only the four dimension scores and a short evidence note.

Never add points for praise, visual polish, university, prior employer,
English fluency beyond basic clarity, CV quality, or agreement with a founder's
preferred solution.
