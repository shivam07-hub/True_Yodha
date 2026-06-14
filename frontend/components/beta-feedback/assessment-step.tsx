import {
  PRODUCT_AREAS,
  type BetaFeedbackDraft,
  type BetaFeedbackErrors,
} from "@/lib/beta-feedback"
import { BetaField, describedBy } from "./field"

type TextField = Exclude<
  keyof BetaFeedbackDraft,
  | "role_stream"
  | "device_type"
  | "operating_system"
  | "browser"
  | "connection_type"
  | "session_outcome"
  | "time_to_value"
  | "areas_explored"
  | "biggest_problem_area"
  | "rating_next_step"
  | "rating_trust"
  | "rating_relevance"
  | "rating_return"
  | "rating_recommend"
  | "privacy_confirmation"
  | "independent_work_confirmation"
  | "final_submission_confirmation"
>

const questions: Array<{
  field: TextField
  label: string
  placeholder: string
  optional?: boolean
}> = [
  {
    field: "product_understanding",
    label: "What does Myro do, and who benefits most?",
    placeholder: "Explain Myro in one or two sentences.",
  },
  {
    field: "most_useful_moment",
    label: "What was your most useful moment?",
    placeholder: "Describe the result or interaction and why it mattered.",
  },
  {
    field: "biggest_problem",
    label: "What was your biggest problem?",
    placeholder: "Describe the most confusing, inaccurate, slow, or frustrating moment.",
  },
  {
    field: "attempted_action",
    label: "What were you trying to do?",
    placeholder: "Name the task you were attempting.",
  },
  {
    field: "expected_result",
    label: "What did you expect?",
    placeholder: "Describe the result or behavior you expected.",
  },
  {
    field: "actual_result",
    label: "What actually happened?",
    placeholder: "Describe what Myro showed or did instead.",
  },
  {
    field: "reproduction_steps",
    label: "How can we reproduce it?",
    placeholder: "Add the shortest steps for a bug. Leave blank when not applicable.",
    optional: true,
  },
  {
    field: "priority_improvement",
    label: "What one improvement should come first?",
    placeholder: "Recommend one focused product change.",
  },
  {
    field: "priority_reason",
    label: "Why should it be prioritized?",
    placeholder: "Explain the user problem and why this change matters most.",
  },
  {
    field: "preserve",
    label: "What should remain unchanged?",
    placeholder: "Name one part of Myro worth preserving and explain why.",
  },
  {
    field: "return_trigger",
    label: 'Complete: "I would return to Myro when..."',
    placeholder: "Describe the moment that would bring you back.",
  },
]

export function AssessmentStep({
  draft,
  errors,
  update,
}: {
  draft: BetaFeedbackDraft
  errors: BetaFeedbackErrors
  update: <K extends keyof BetaFeedbackDraft>(field: K, value: BetaFeedbackDraft[K]) => void
}) {
  return (
    <div className="bf-step">
      <div className="bf-step-heading">
        <h2>Your assessment</h2>
        <p>Specific moments are more useful than general advice.</p>
      </div>

      <BetaField
        id="biggest_problem_area"
        label="Where did your biggest problem occur?"
        error={errors.biggest_problem_area}
      >
        <select
          id="biggest_problem_area"
          className="bf-control"
          value={draft.biggest_problem_area}
          aria-invalid={Boolean(errors.biggest_problem_area)}
          aria-describedby={describedBy("biggest_problem_area", errors.biggest_problem_area)}
          onChange={(event) => update("biggest_problem_area", event.target.value as BetaFeedbackDraft["biggest_problem_area"])}
        >
          <option value="">Select one</option>
          {PRODUCT_AREAS.map((area) => <option key={area}>{area}</option>)}
        </select>
      </BetaField>

      {questions.map(({ field, label, placeholder, optional }) => (
        <BetaField key={field} id={field} label={label} error={errors[field]} optional={optional}>
          <textarea
            id={field}
            className="bf-control bf-textarea"
            value={draft[field]}
            maxLength={2000}
            placeholder={placeholder}
            aria-invalid={Boolean(errors[field])}
            aria-describedby={describedBy(field, errors[field])}
            onChange={(event) => update(field, event.target.value)}
          />
        </BetaField>
      ))}
    </div>
  )
}
