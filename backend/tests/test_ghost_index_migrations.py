"""The migrations behind the Ghost Job Index.

The index publishes a number about named employers. Every contract asserted here
exists because getting it wrong would put a false accusation on a public page,
which is the one failure a trust product cannot take back.
"""

from pathlib import Path

MIGRATIONS = Path(__file__).parents[2] / "database/migrations"
FOUNDATION = (MIGRATIONS / "20260905_ghost_index_foundation.sql").read_text()
REFRESH = (MIGRATIONS / "20260905b_ghost_index_refresh.sql").read_text()
CORRECTION = (MIGRATIONS / "20260905c_ghost_index_metric_correction.sql").read_text()
PAYLOAD = (MIGRATIONS / "20260905d_ghost_index_payload.sql").read_text()
TIER0 = (MIGRATIONS / "20260905e_ghost_index_corpus_count_tier0.sql").read_text()
SCHEDULE = (MIGRATIONS / "20260905f_ghost_index_scheduled_refresh.sql").read_text()


def test_admissibility_is_a_rule_about_evidence_not_a_date_range() -> None:
    """The 19,252 bad closes are excluded by WHY they are bad, not by when.

    A date-range exclusion silently readmits the same defect the next time a
    provider's URL shape changes, and it cannot be audited by anyone reading the
    published method.
    """
    fn = FOUNDATION.split("create or replace function public.close_evidence_is_admissible")[1]
    fn = fn.split("$$;")[0]
    assert "myworkdayjobs" in fn
    assert "provider" in fn
    for date_literal in ("2026-07", "2026-08", "observed_at", "between"):
        assert date_literal not in fn


def test_the_admissibility_rule_has_exactly_one_home() -> None:
    """Published figure and later audit must read the same definition.

    A second copy in application code is how the index and its own methodology
    page drift apart without either being edited.
    """
    assert "close_evidence_is_admissible" in FOUNDATION
    assert "close_evidence_is_admissible" in FOUNDATION.split("create or replace view public.listing_close_events")[1]


def test_feed_presence_never_reads_jobs_last_seen() -> None:
    """`jobs.last_seen` equals `first_seen` on all 72,500 rows.

    It is the ingest date wearing a liveness name. Feed presence comes from
    scraper observations or it does not exist.
    """
    view = FOUNDATION.split("create or replace view public.listing_feed_presence")[1]
    view = view.split(";")[0]
    assert "observer = 'scraper'" in view
    assert "last_seen" not in view


def test_still_advertised_and_pulled_share_one_population() -> None:
    """Both numerators must sit inside `feed_overlap`.

    They did not at first: `ad_pulled` omitted the `last_in_feed` clause, so a
    listing the scraper only ever saw MISSING counted as pulled while the
    denominator excluded it — AMD reported 149 pulled against an overlap of 25.
    """
    base = CORRECTION.split("as still_advertised,")[1].split("as ad_pulled,")[0]
    assert "f.last_in_feed is not null" in base


def test_a_rate_is_withheld_below_the_minimum_cell() -> None:
    """"100% ghost (2 of 2)" is a libel, not a statistic.

    Counts still publish — only the rate is withheld, so a reader can always see
    what the cell was too small to support.
    """
    assert "v_min_cell integer := 20" in CORRECTION
    assert "case when feed_overlap >= v_min_cell" in CORRECTION


def test_corpus_state_is_null_on_monthly_rows() -> None:
    """A monthly cell contains only listings that closed that month.

    A `listings_live` of 0 there would read as "no live roles this month" rather
    than "not applicable". NULL says the second thing.
    """
    for column in ("listings_conclusive", "listings_live", "listings_inconclusive"):
        assert f"case when period = 'all' then {column} end" in CORRECTION


def test_every_published_row_carries_its_method_version() -> None:
    """A figure quoted from the index stays checkable after the method moves.

    v1 and v2 disagree by 37 points on the headline; without the stamp there is
    no way to tell which one a screenshot came from.
    """
    assert "method_version  text not null" in CORRECTION
    assert "v_method   text := 'ghost-index-v2'" in CORRECTION


def test_the_refresh_is_service_role_only() -> None:
    """Anyone may read the index. Nobody but the platform may compute it."""
    assert "revoke all on function public.refresh_ghost_index() from public, anon, authenticated;" in CORRECTION
    assert "grant execute on function public.refresh_ghost_index() to service_role;" in CORRECTION
    assert "for select to anon, authenticated using (true)" in CORRECTION


def test_the_index_reads_no_user_data() -> None:
    """Public aggregate over public listings. No PII enters the snapshot."""
    for user_table in ("user_profiles", "job_applications", "cv_versions", "user_id"):
        assert user_table not in CORRECTION


def test_the_refresh_aggregates_in_sql_not_in_python() -> None:
    """462k observations cannot travel through PostgREST.

    The 1000-row cap truncates silently — the index would be wrong quietly, and
    only at scale.
    """
    assert "language plpgsql" in CORRECTION
    assert "percentile_cont" in CORRECTION


def test_v1_left_no_tautological_column_behind() -> None:
    """v1's `ghost_rate` returned 1.000 for thirteen of the fifteen largest
    employers — it measured our own crawl cadence. It is replaced, not kept
    beside the corrected metric where it could still be published."""
    assert "drop table if exists public.ghost_index_snapshot cascade;" in CORRECTION
    assert "ghost_rate" not in CORRECTION.split("create table public.ghost_index_snapshot")[1]
    # v1 shipped the flawed definition; the correction migration is the authority.
    assert "ghost_rate" in REFRESH


def test_the_public_payload_never_aggregates_public_jobs() -> None:
    """Counting distinct employers live cost 6,041ms as `anon`.

    `idx_jobs_trusted_ingested_at` is partial on the first branch of the jobs
    RLS policy, and the planner cannot reach a partial index through an OR whose
    other branch matches rows outside the predicate — so it rechecked 12,276
    heap blocks and the whole payload hit the 8s statement timeout. The count is
    now written at refresh time, where service_role makes it cheap.
    """
    payload_fn = TIER0.split("create or replace function public.ghost_index_payload")[1]
    assert "from jobs" not in payload_fn
    assert "companies_in_corpus from overall" in payload_fn


def test_the_corpus_count_is_written_only_on_the_overall_row() -> None:
    """It is corpus state, not a property of any one company or sector."""
    assert "case when scope = 'overall' and period = 'all' then v_companies end" in TIER0
    for scoped in ("companies", "sectors"):
        block = TIER0.split(f"'{scoped}', coalesce(")[1].split("'[]'::jsonb)")[0]
        assert "- 'companies_in_corpus'" in block


def test_the_read_is_one_round_trip() -> None:
    """~165ms per hop on this path, and PostgREST truncates at 1000 rows in
    silence. Four reads would have been slower and quietly lossy."""
    assert "jsonb_build_object" in PAYLOAD
    assert "returns jsonb" in PAYLOAD


def test_the_payload_is_invoker_not_definer() -> None:
    """The snapshot policy is `using (true)`, so a definer would buy no plan
    change and add an oracle to audit."""
    fn = TIER0.split("create or replace function public.ghost_index_payload")[1].split("$$;")[0]
    assert "security definer" not in fn


def test_the_refresh_runs_through_the_existing_orchestration() -> None:
    """One scheduler, not two. `run_snapshot_sql_refresh` already owns the
    lease, the attempt counter and the error capture."""
    assert "'skill_demand', 'job_search', 'ghost_index'" in SCHEDULE
    assert "elsif p_task = 'ghost_index' then" in SCHEDULE
    assert "select public.refresh_ghost_index() into v_result;" in SCHEDULE


def test_the_snapshot_state_has_exactly_one_writer() -> None:
    """The refresh used to stamp `succeeded` itself while the orchestrator also
    stamped it. Two writers to one row drift, and only one holds the lease — so
    a run that failed after its own stamp would still read as succeeded."""
    refresh_fn = SCHEDULE.split("create or replace function public.refresh_ghost_index")[1]
    refresh_fn = refresh_fn.split("$$;")[0]
    assert "update snapshot_refresh_state" not in refresh_fn
    assert "finish_snapshot_refresh" in SCHEDULE


def test_a_daily_task_does_not_use_the_24h_staleness_heuristic() -> None:
    """`request_snapshot_refresh` flips tasks whose last success is older than
    24 HOURS. This refresh takes 34s, so `last_success_at` lands 34s past the
    cron minute and the next day's run sees 24h-minus-34s — it would skip, and
    the index would rebuild every OTHER day while claiming a daily cadence.
    """
    cron_body = SCHEDULE.split("select cron.schedule(")[1]
    assert "request_snapshot_refresh_task('ghost_index'" in cron_body
    assert "request_snapshot_refresh('cron" not in cron_body


def test_a_task_request_never_interrupts_a_live_lease() -> None:
    """The lease holder is mid-refresh; flipping it back to pending would let a
    second run start on top of it."""
    fn = SCHEDULE.split("create or replace function public.request_snapshot_refresh_task")[1]
    fn = fn.split("$function$;")[0]
    assert "not (s.status = 'running'" in fn
    assert "lease_expires_at" in fn


def test_the_refresh_is_scheduled_off_peak() -> None:
    """34.3s and 273k buffers on shared Free/Nano compute. 20:40 UTC is ~02:10
    IST — the quietest hour for an India-first product."""
    assert "'40 20 * * *'" in SCHEDULE
