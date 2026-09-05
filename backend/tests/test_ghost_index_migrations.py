"""The three migrations behind the Ghost Job Index.

The index publishes a number about named employers. Every contract asserted here
exists because getting it wrong would put a false accusation on a public page,
which is the one failure a trust product cannot take back.
"""

from pathlib import Path

MIGRATIONS = Path(__file__).parents[2] / "database/migrations"
FOUNDATION = (MIGRATIONS / "20260905_ghost_index_foundation.sql").read_text()
REFRESH = (MIGRATIONS / "20260905b_ghost_index_refresh.sql").read_text()
CORRECTION = (MIGRATIONS / "20260905c_ghost_index_metric_correction.sql").read_text()


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
