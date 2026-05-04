# Feature: Report Job as Inactive
*Planned 2026-05-03 — NOT YET BUILT*

---

## Purpose

Community-driven job freshness. Users tap a single button to signal a job is no longer open.
5 independent reports → job hidden from default view. Every report earns the reporter +10 XP
in their Diary (community loop incentive).

---

## Design Decisions (locked)

| Decision | Value |
|---|---|
| UI | Single button — "Report as Inactive" — no reason dropdown |
| Threshold | 5 reports → `is_active = false` → hidden from default view |
| Auth | Required — anonymous reports not allowed |
| Uniqueness | 1 report per user per job — DB-enforced UNIQUE constraint |
| Daily cap | Max 3 reports/day per user — backend guard (429 if exceeded) |
| XP reward | +10 XP per report via `daily_logs.skills_delta` |
| XP display | `taxonomy_key = "community_reporter"` → renders as "🛡 Community Contribution +10 XP" |
| is_active ownership | Community only — scraper NEVER sets `is_active = false` |

---

## Layer 1 — Supabase DB

These migrations run in **firecrawl_Supabase** (not True_Yodha):

```sql
-- Add to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS report_count INT NOT NULL DEFAULT 0;

-- job_reports table
CREATE TABLE public.job_reports (
  id          BIGSERIAL PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, user_id)
);
CREATE INDEX idx_job_reports_job_id  ON job_reports(job_id);
CREATE INDEX idx_job_reports_user_id ON job_reports(user_id);
CREATE INDEX idx_job_reports_user_date ON job_reports(user_id, reported_at DESC);

-- Trigger: increment report_count; deactivate at 5
CREATE OR REPLACE FUNCTION fn_job_report_deactivation()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE jobs
  SET
    report_count = report_count + 1,
    is_active    = CASE WHEN report_count + 1 >= 5 THEN false ELSE is_active END
  WHERE job_id = NEW.job_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_job_report_deactivation
AFTER INSERT ON job_reports
FOR EACH ROW EXECUTE FUNCTION fn_job_report_deactivation();

-- RLS
ALTER TABLE job_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users can insert own reports"
  ON job_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reports readable by all authenticated"
  ON job_reports FOR SELECT USING (auth.role() = 'authenticated');
```

---

## Layer 2 — FastAPI Backend (True_Yodha)

### New file: `backend/app/routers/jobs/report.py`

```python
from datetime import date, timezone, datetime
from fastapi import APIRouter, Depends, HTTPException, status
from app.deps import get_current_user
from app.database import get_supabase_client

router = APIRouter()

MAX_DAILY_REPORTS = 3
XP_PER_REPORT = 10
COMMUNITY_TAXONOMY_KEY = "community_reporter"


@router.post("/{job_id}/report", status_code=status.HTTP_200_OK)
async def report_job_inactive(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]
    sb = get_supabase_client()
    today = date.today()

    # Guard 1: already reported this job
    existing = (
        sb.table("job_reports")
        .select("id")
        .eq("job_id", job_id)
        .eq("user_id", user_id)
        .execute()
    ).data
    if existing:
        raise HTTPException(status_code=409, detail="Already reported this job")

    # Guard 2: daily cap
    today_start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc).isoformat()
    daily_count = len((
        sb.table("job_reports")
        .select("id")
        .eq("user_id", user_id)
        .gte("reported_at", today_start)
        .execute()
    ).data or [])
    if daily_count >= MAX_DAILY_REPORTS:
        raise HTTPException(status_code=429, detail="Daily report limit reached (3/day)")

    # Insert report (trigger handles report_count + deactivation)
    sb.table("job_reports").insert({
        "job_id": job_id,
        "user_id": user_id,
    }).execute()

    # Award XP: append to today's daily_log skills_delta
    _award_xp(sb, user_id, today)

    # Return updated report_count
    job_row = (
        sb.table("jobs").select("report_count").eq("job_id", job_id).single().execute()
    ).data
    return {
        "report_count": (job_row or {}).get("report_count", 1),
        "already_reported": False,
        "xp_earned": XP_PER_REPORT,
    }


def _award_xp(sb, user_id: str, today: date) -> None:
    delta_item = {"taxonomy_key": COMMUNITY_TAXONOMY_KEY, "xp_added": XP_PER_REPORT}
    existing_log = (
        sb.table("daily_logs")
        .select("id, skills_delta")
        .eq("user_id", user_id)
        .eq("log_date", today.isoformat())
        .execute()
    ).data
    if existing_log:
        log = existing_log[0]
        current_delta = log.get("skills_delta") or []
        sb.table("daily_logs").update({
            "skills_delta": current_delta + [delta_item]
        }).eq("id", log["id"]).execute()
    else:
        sb.table("daily_logs").insert({
            "user_id": user_id,
            "log_date": today.isoformat(),
            "entry_text": "",
            "skills_delta": [delta_item],
        }).execute()
```

### Register in `backend/app/routers/jobs/__init__.py` or `main.py`

```python
from .report import router as report_router
app.include_router(report_router, prefix="/jobs", tags=["jobs"])
```

### Also add to `GET /jobs/{job_id}` response:
Return `report_count` + `already_reported` (query `job_reports` for current user) so the
frontend knows initial state on page load.

---

## Layer 3 — Frontend (True_Yodha Next.js)

### `frontend/lib/api.ts` — add to `jobs` namespace

```typescript
reportInactive: (token: string, jobId: string) =>
  request<{ report_count: number; already_reported: boolean; xp_earned: number }>(
    `/jobs/${jobId}/report`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  ),
```

Also update `JobMatch` interface to include:
```typescript
report_count: number
already_reported: boolean
```

### `frontend/app/jobs/page.tsx` — `JobCard` changes

Add report state + mutation:
```tsx
const [reportCount, setReportCount] = useState(job.report_count ?? 0)
const [reported, setReported]       = useState(job.already_reported ?? false)

const reportMutation = useMutation({
  mutationFn: () => jobs.reportInactive(token!, job.job_id),
  onSuccess: (data) => {
    setReportCount(data.report_count)
    setReported(true)
  },
})
```

Add below the Track + Open role buttons:
```tsx
{/* Report count label */}
{reportCount > 0 && (
  <span style={{ fontSize: 12, color: "var(--tm-text-faint)" }}>
    {reportCount} user{reportCount > 1 ? "s" : ""} reported inactive
  </span>
)}

{/* Report button */}
<button
  type="button"
  disabled={reported || reportMutation.isPending}
  onClick={() => reportMutation.mutate()}
  className="tm-btn tm-btn-ghost"
  style={{
    height: 30, padding: "0 12px", fontSize: 12,
    opacity: reported ? 0.5 : 1,
    color: reported ? "var(--tm-text-faint)" : undefined,
  }}
>
  {reported ? "✓ Reported" : "Report as Inactive"}
</button>
```

### `frontend/app/diary/page.tsx` — display community XP

In the skill delta render section, map `community_reporter` to a readable label:

```tsx
const skillLabel = (key: string) =>
  key === "community_reporter" ? "🛡 Community Contribution" : key

// In render:
{sd.xp_added} XP  ←  replace taxonomy_key display with skillLabel(sd.taxonomy_key)
```

---

## Execution Order (next session)

1. Confirm `job_reports` table + trigger exist in Supabase (run in firecrawl_Supabase first)
2. Confirm `jobs.report_count` column exists
3. Create `backend/app/routers/jobs/report.py`
4. Register router in main.py
5. Write tests: `backend/tests/test_job_report.py`
   - Happy path: report succeeds, XP awarded
   - 409: second report same job
   - 429: 4th report in same day
6. Add `jobs.reportInactive` to `frontend/lib/api.ts`
7. Update `JobMatch` interface
8. Update `JobCard` in `frontend/app/jobs/page.tsx`
9. Update diary XP label in `frontend/app/diary/page.tsx`
10. Run: `tsc --noEmit` + `next lint` + `pytest backend/tests`
11. Commit to `Develop`

---

## User Loop Summary

```
User finds dead job
  → taps "Report as Inactive"  (auth required)
  → +10 XP added to today's Diary entry
  → "✓ Reported" shown on job card
  → report_count label visible to all users
  → at 5 reports → job hidden from default view
  → Diary shows "🛡 Community Contribution +10 XP"
  → user feels ownership → returns → reports more
  → data quality improves platform-wide
```
