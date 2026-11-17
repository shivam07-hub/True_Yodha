"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { jobs, type HostedInternshipInput } from "@/lib/api"
import { ApiError } from "@/lib/api-error"
import { useSession } from "@/lib/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { ReachCount, type ReachInput } from "./reach-count"
import { MY_INTERNSHIPS_KEY } from "./keys"
import { stashPendingInternshipPost, takePendingInternshipPost } from "@/lib/internship-post-stash"
import "./internships.css"

function splitSkills(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean)
}

/** An empty field is no answer, not 0. */
function yearsOf(form: FormData, name: string): number | null {
  const raw = String(form.get(name) ?? "").trim()
  return raw === "" ? null : Number(raw)
}

function reachFromForm(form: FormData): ReachInput {
  return {
    city: String(form.get("location") || ""),
    remote: form.get("location_mode") === "remote",
    skills: splitSkills(String(form.get("skills") || "")),
    kind: form.get("employment_kind") === "full_time" ? "full_time" : "internship",
    minYears: yearsOf(form, "min_years_experience"),
  }
}

export function InternshipPostForm({ onPosted, onCancel }: { onPosted?: () => void; onCancel?: () => void } = {}) {
  // Passive: she writes the post before she has an account. useAuth would
  // send a logged-out visitor to /login before she saw the form.
  const { token } = useSession()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const queryClient = useQueryClient()
  const [reach, setReach] = useState<ReachInput>({
    city: "", remote: false, skills: [], kind: "internship", minYears: null,
  })
  const [kind, setKind] = useState<"internship" | "full_time">("internship")

  async function post(authToken: string, body: HostedInternshipInput) {
    setPending(true)
    try {
      await jobs.postInternship(authToken, body)
      await queryClient.invalidateQueries({ queryKey: MY_INTERNSHIPS_KEY })
      onPosted?.()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not post this opening")
    } finally {
      setPending(false)
    }
  }

  // She pressed Post before she had an account. Sign-in brought her back here
  // (postAuthDestination); the post goes out once, as written.
  useEffect(() => {
    if (!token) return
    const carried = takePendingInternshipPost()
    if (carried) void post(token, carried)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the token lands; take() clears, so it posts once
  }, [token])

  async function onSubmit(form: FormData) {
    setError(null)
    const employment_kind = form.get("employment_kind") === "full_time" ? "full_time" : "internship"
    const low = Number(form.get("stipend_low_inr") || 0)
    if (employment_kind === "internship" && low <= 0) {
      setError("Paid internships only")
      return
    }
    const body: HostedInternshipInput = {
      company_name: String(form.get("company_name") || "").trim(),
      job_title: String(form.get("job_title") || "").trim(),
      employment_kind,
      location: String(form.get("location") || "").trim() || null,
      location_mode: (String(form.get("location_mode") || "onsite") as HostedInternshipInput["location_mode"]),
      job_description: String(form.get("job_description") || "").trim(),
      skills: splitSkills(String(form.get("skills") || "")),
      ...(employment_kind === "internship"
        ? {
            stipend_low_inr: low,
            stipend_high_inr: Number(form.get("stipend_high_inr") || low) || low,
            duration_months: Number(form.get("duration_months") || 0),
            ppo: form.get("ppo") === "on",
          }
        : {
            min_years_experience: yearsOf(form, "min_years_experience"),
            max_years_experience: yearsOf(form, "max_years_experience"),
          }),
    }
    if (!token) {
      stashPendingInternshipPost(body)
      router.push("/login")
      return
    }
    await post(token, body)
  }

  return (
    <main className="intern-page">
      <p className="intern-kicker">Myro Supported</p>
      <h1 className="intern-title">Post an opening</h1>
      <p className="intern-lead">People apply on this page. The application is a CV written for the role.</p>
      <form
        className="intern-form"
        onChange={(e) => setReach(reachFromForm(new FormData(e.currentTarget)))}
        onSubmit={(e) => { e.preventDefault(); void onSubmit(new FormData(e.currentTarget)) }}
      >
        <fieldset className="intern-kind">
          <legend>Opening</legend>
          <label>
            <input type="radio" name="employment_kind" value="internship" checked={kind === "internship"} onChange={() => setKind("internship")} />
            Internship
          </label>
          <label>
            <input type="radio" name="employment_kind" value="full_time" checked={kind === "full_time"} onChange={() => setKind("full_time")} />
            Job
          </label>
        </fieldset>
        <label>Company
          <input name="company_name" required minLength={2} autoComplete="organization" />
        </label>
        <label>Role
          <input name="job_title" required minLength={3} placeholder={kind === "internship" ? "Product intern" : "Area sales manager"} />
        </label>
        {kind === "internship" ? (
          <>
            <div className="intern-row">
              <label>Stipend from (INR / mo)
                <input name="stipend_low_inr" type="number" min={1} required />
              </label>
              <label>Stipend to (INR / mo)
                <input name="stipend_high_inr" type="number" min={1} />
              </label>
            </div>
            <div className="intern-row">
              <label>Duration (months)
                <input name="duration_months" type="number" min={1} max={12} required defaultValue={3} />
              </label>
              <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input name="ppo" type="checkbox" /> PPO
              </label>
            </div>
          </>
        ) : (
          <div className="intern-row">
            <label>Years from
              <input name="min_years_experience" type="number" inputMode="numeric" min={0} max={40} required placeholder="0" />
            </label>
            <label>Years to
              <input name="max_years_experience" type="number" inputMode="numeric" min={0} max={40} />
            </label>
          </div>
        )}
        <div className="intern-row">
          <label>Work mode
            <select name="location_mode" defaultValue="onsite">
              <option value="onsite">On-site</option>
              <option value="hybrid">Hybrid</option>
              <option value="remote">Remote</option>
            </select>
          </label>
        </div>
        <label>City
          <input name="location" placeholder="Bengaluru" />
        </label>
        <label>What they will do
          <textarea name="job_description" required minLength={20} />
        </label>
        <label>Skills (comma separated)
          <input name="skills" placeholder="SQL, Figma" />
        </label>
        <ReachCount input={reach} />
        {error ? <p className="intern-error">{error}</p> : null}
        <button type="submit" className="intern-submit" disabled={pending}>
          {pending ? "Posting" : "Post opening"}
        </button>
        {onCancel ? (
          <Button type="button" variant="neutral" size="lg" onClick={onCancel}>Back to your openings</Button>
        ) : null}
      </form>
    </main>
  )
}
