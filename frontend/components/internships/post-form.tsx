"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { jobs, type HostedInternshipInput } from "@/lib/api"
import { ApiError } from "@/lib/api-error"
import { useAuth } from "@/lib/hooks/use-auth"
import { stashPendingInternshipPost, takePendingInternshipPost } from "@/lib/internship-post-stash"
import "./internships.css"

export function InternshipPostForm() {
  const { token } = useAuth()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function post(authToken: string, body: HostedInternshipInput) {
    setPending(true)
    try {
      await jobs.postInternship(authToken, body)
      router.push("/internships")
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not post this internship")
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
    const low = Number(form.get("stipend_low_inr") || 0)
    if (low <= 0) {
      setError("Paid internships only")
      return
    }
    const body: HostedInternshipInput = {
      company_name: String(form.get("company_name") || "").trim(),
      job_title: String(form.get("job_title") || "").trim(),
      stipend_low_inr: low,
      stipend_high_inr: Number(form.get("stipend_high_inr") || low) || low,
      duration_months: Number(form.get("duration_months") || 0),
      ppo: form.get("ppo") === "on",
      location: String(form.get("location") || "").trim() || null,
      location_mode: (String(form.get("location_mode") || "onsite") as HostedInternshipInput["location_mode"]),
      job_description: String(form.get("job_description") || "").trim(),
      skills: String(form.get("skills") || "").split(",").map((s) => s.trim()).filter(Boolean),
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
      <p className="intern-kicker">Hosted on Myro</p>
      <h1 className="intern-title">Post a paid internship</h1>
      <p className="intern-lead">Students apply here, with the CV they already have on Myro.</p>
      <form className="intern-form" onSubmit={(e) => { e.preventDefault(); void onSubmit(new FormData(e.currentTarget)) }}>
        <label>Company
          <input name="company_name" required minLength={2} autoComplete="organization" />
        </label>
        <label>Role
          <input name="job_title" required minLength={3} placeholder="Product intern" />
        </label>
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
        <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input name="ppo" type="checkbox" /> PPO
        </label>
        <label>What they will do
          <textarea name="job_description" required minLength={20} />
        </label>
        <label>Skills (comma separated)
          <input name="skills" placeholder="SQL, Figma" />
        </label>
        {error ? <p className="intern-error">{error}</p> : null}
        <button type="submit" className="intern-submit" disabled={pending}>
          {pending ? "Posting" : "Post internship"}
        </button>
      </form>
    </main>
  )
}
