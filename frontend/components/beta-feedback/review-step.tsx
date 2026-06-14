import { Button } from "@/components/ui/button"
import {
  type BetaFeedbackDraft,
  type BetaFeedbackErrors,
} from "@/lib/beta-feedback"
import { describedBy } from "./field"

const ratings = [
  ["rating_next_step", "I understood what to do next."],
  ["rating_trust", "I trusted the results shown to me."],
  ["rating_relevance", "The results felt relevant to my career."],
  ["rating_return", "I would use Myro again."],
  ["rating_recommend", "I would recommend Myro to another job seeker."],
] as const

const confirmations = [
  [
    "privacy_confirmation",
    "I did not attach my CV and removed personal information from anything I described.",
  ],
  [
    "independent_work_confirmation",
    "These observations came from my own Myro session.",
  ],
  [
    "final_submission_confirmation",
    "I understand that this submission is final and cannot be edited.",
  ],
] as const

const assessmentSummary = [
  ["Understanding", "product_understanding"],
  ["Most useful moment", "most_useful_moment"],
  ["Biggest problem", "biggest_problem"],
  ["Priority improvement", "priority_improvement"],
  ["Why it matters", "priority_reason"],
  ["Preserve", "preserve"],
  ["Return trigger", "return_trigger"],
] as const

export function ReviewStep({
  draft,
  errors,
  update,
  onSubmit,
  submitting,
}: {
  draft: BetaFeedbackDraft
  errors: BetaFeedbackErrors
  update: <K extends keyof BetaFeedbackDraft>(field: K, value: BetaFeedbackDraft[K]) => void
  onSubmit: () => void
  submitting: boolean
}) {
  return (
    <div className="bf-step">
      <div className="bf-step-heading">
        <h2>Ratings and final review</h2>
        <p>Check every answer before sending. This submission is final.</p>
      </div>

      <div className="bf-ratings">
        {ratings.map(([field, label]) => (
          <fieldset className="bf-rating" key={field} aria-describedby={describedBy(field, errors[field])}>
            <legend>{label}</legend>
            <div className="bf-rating-options">
              {[1, 2, 3, 4, 5].map((rating) => (
                <label key={rating}>
                  <input
                    type="radio"
                    name={field}
                    value={rating}
                    checked={draft[field] === rating}
                    onChange={() => update(field, rating)}
                  />
                  <span>{rating}</span>
                </label>
              ))}
            </div>
            {errors[field] && <p className="bf-error" id={`${field}-error`} role="alert">{errors[field]}</p>}
          </fieldset>
        ))}
      </div>

      <section className="bf-review" aria-labelledby="bf-review-heading">
        <h3 id="bf-review-heading">Your response</h3>
        <dl>
          <div><dt>Track</dt><dd>{draft.role_stream}</dd></div>
          <div><dt>Session</dt><dd>{draft.device_type} · {draft.browser} · {draft.connection_type}</dd></div>
          <div><dt>Outcome</dt><dd>{draft.session_outcome} · {draft.time_to_value}</dd></div>
          <div><dt>Areas</dt><dd>{draft.areas_explored.join(", ")}</dd></div>
          {assessmentSummary.map(([label, field]) => (
            <div key={field}><dt>{label}</dt><dd>{draft[field]}</dd></div>
          ))}
        </dl>
      </section>

      <div className="bf-confirmations">
        {confirmations.map(([field, label]) => (
          <div key={field}>
            <label className="bf-confirmation">
              <input
                type="checkbox"
                checked={draft[field]}
                aria-describedby={describedBy(field, errors[field])}
                onChange={(event) => update(field, event.target.checked)}
              />
              <span>{label}</span>
            </label>
            {errors[field] && <p className="bf-error" id={`${field}-error`} role="alert">{errors[field]}</p>}
          </div>
        ))}
      </div>

      <Button
        className="bf-button"
        size="lg"
        loading={submitting}
        onClick={onSubmit}
      >
        Final submission
      </Button>
    </div>
  )
}
