import {
  BROWSERS,
  CONNECTION_TYPES,
  DEVICE_TYPES,
  OPERATING_SYSTEMS,
  PRODUCT_AREAS,
  ROLE_STREAMS,
  SESSION_OUTCOMES,
  TIME_TO_VALUE_OPTIONS,
  type BetaFeedbackDraft,
  type BetaFeedbackErrors,
} from "@/lib/beta-feedback"
import { BetaField, describedBy } from "./field"

type Update = <K extends keyof BetaFeedbackDraft>(
  field: K,
  value: BetaFeedbackDraft[K],
) => void

const selects = [
  ["role_stream", "Internship track", ROLE_STREAMS],
  ["device_type", "Device used", DEVICE_TYPES],
  ["operating_system", "Operating system", OPERATING_SYSTEMS],
  ["browser", "Browser", BROWSERS],
  ["connection_type", "Connection used", CONNECTION_TYPES],
  ["session_outcome", "How far did you get?", SESSION_OUTCOMES],
  ["time_to_value", "Time until your first useful result", TIME_TO_VALUE_OPTIONS],
] as const

export function SessionStep({
  draft,
  errors,
  update,
}: {
  draft: BetaFeedbackDraft
  errors: BetaFeedbackErrors
  update: Update
}) {
  function toggleArea(area: (typeof PRODUCT_AREAS)[number]) {
    const selected = draft.areas_explored.includes(area)
    update(
      "areas_explored",
      selected
        ? draft.areas_explored.filter((item) => item !== area)
        : [...draft.areas_explored, area],
    )
  }

  return (
    <div className="bf-step">
      <div className="bf-step-heading">
        <h2>Your test session</h2>
        <p>Tell us how and where you used Myro.</p>
      </div>

      <div className="bf-grid">
        {selects.map(([field, label, options]) => (
          <BetaField key={field} id={field} label={label} error={errors[field]}>
            <select
              id={field}
              className="bf-control"
              value={draft[field]}
              aria-invalid={Boolean(errors[field])}
              aria-describedby={describedBy(field, errors[field])}
              onChange={(event) => update(field, event.target.value as BetaFeedbackDraft[typeof field])}
            >
              <option value="">Select one</option>
              {options.map((option) => <option key={option}>{option}</option>)}
            </select>
          </BetaField>
        ))}
      </div>

      <fieldset className="bf-fieldset" aria-describedby={describedBy("areas_explored", errors.areas_explored)}>
        <legend className="bf-label">Areas explored</legend>
        <div className="bf-check-grid">
          {PRODUCT_AREAS.map((area) => (
            <label className="bf-choice" key={area}>
              <input
                type="checkbox"
                checked={draft.areas_explored.includes(area)}
                onChange={() => toggleArea(area)}
              />
              <span>{area}</span>
            </label>
          ))}
        </div>
        {errors.areas_explored && (
          <p className="bf-error" id="areas_explored-error" role="alert">
            {errors.areas_explored}
          </p>
        )}
      </fieldset>
    </div>
  )
}
