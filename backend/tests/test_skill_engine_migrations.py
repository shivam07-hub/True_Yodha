"""Contract locks on the skill-engine migrations.

Every assertion here is a property that was, at some point on 2026-08-06, wrong
in prod. They are cheap to keep and each one names what it cost.
"""

from pathlib import Path

MIGRATIONS = Path(__file__).parents[2] / "database/migrations"
ENRICHMENT = MIGRATIONS / "20260806b_enrichment_may_not_claim_complete_without_skills.sql"
FLOOR_QUEUE = MIGRATIONS / "20260806e_skill_floor_queue.sql"
FLOOR_CLAIM_PARITY = MIGRATIONS / "20260815150608_skill_floor_claim_matches_monitor.sql"
HARD_SOFT = MIGRATIONS / "20260806h_hard_soft_derived.sql"
# The judgment queue's guards were re-cut here; this file, not 20260806i, holds
# the live definition of the claim and the release.
JUDGMENT_EVIDENCE = MIGRATIONS / "20260807_stage_b_judgment_evidence.sql"
# Likewise for apply_job_enrichment and refresh_job_role_family: this file holds
# the live definitions, 20260806b and 20260806e hold their history.
FORWARD_FLOW = MIGRATIONS / "20260807b_enrichment_stops_owning_skills.sql"
WORKER_ONLY = MIGRATIONS / "20260825130000_worker_rpcs_are_not_public.sql"


def test_enrichment_never_deletes_skills_for_an_empty_result() -> None:
    """The unconditional DELETE removed skills a job already had.

    An empty model result is not evidence a job has no skills. Before this, a
    thin enrichment deleted the whole set and inserted nothing.
    """
    sql = ENRICHMENT.read_text()
    delete_at = sql.index("DELETE FROM public.job_skills")
    guard_at = sql.index("IF v_incoming > 0 THEN")

    assert guard_at < delete_at, "the DELETE must sit inside the non-empty guard"


def test_enrichment_may_not_claim_complete_without_skills() -> None:
    """1,088 prod jobs were stamped `complete` carrying zero skill rows.

    Skills were not part of the terminal condition, so `complete` was a claim
    about the summary, not about the thing we sell.
    """
    sql = ENRICHMENT.read_text()

    assert "v_final_skill_count" in sql
    assert "SELECT COUNT(*)::INTEGER INTO v_final_skill_count" in sql
    assert "CASE WHEN v_final_skill_count > 0 THEN 'complete'" in sql


def test_stage_a_claims_atomically_and_owns_only_its_attempt_column() -> None:
    """Stage A borrowing `enrichment_status` made two owners of one column.

    Releasing barren jobs through it to `not_applicable` removed 586 of them
    from Stage B's queue on the strength of a weaker method's failure.
    """
    sql = FLOOR_QUEUE.read_text()
    claim = sql.split("CREATE OR REPLACE FUNCTION public.claim_jobs_for_skill_floor")[1]
    body = claim.split("$function$")[1]

    assert "FOR UPDATE SKIP LOCKED" in body
    assert "SET skill_floor_attempted_at = now()" in body
    assert "enrichment_status" not in body, "Stage A must not write the enrichment lifecycle"


def test_live_stage_a_claim_uses_the_monitors_non_null_work_set() -> None:
    """A counted row must never be impossible for Stage A to claim.

    The optimized monitor counts non-NULL descriptions without detoasting them.
    Keeping the old btrim guard in the claim stranded two empty-description jobs
    forever: every heartbeat saw them, and no drain could move them.
    """
    sql = FLOOR_CLAIM_PARITY.read_text()
    body = sql.split("$function$")[1]

    assert "j.job_description IS NOT NULL" in body
    assert "btrim" not in body
    assert "FOR UPDATE SKIP LOCKED" in body


def test_the_floor_monitor_reads_a_derived_column_not_an_anti_join() -> None:
    """As a live anti-join the monitor exceeded Supabase's statement_timeout.

    62k jobs x 376k skill rows returned 57014 regardless of client timeout. A
    monitor that throws every six hours is not a monitor.
    """
    sql = FLOOR_QUEUE.read_text()
    count_fn = sql.split("CREATE FUNCTION public.count_jobs_missing_skill_floor")[1]

    assert "has_skill_floor IS FALSE" in count_fn
    assert "NOT EXISTS" not in count_fn
    # The stall signal has to stay separable from the known backlog, or the
    # dead-man fires on 213 unactionable jobs every six hours and gets muted.
    assert "awaiting_stage_a" in count_fn
    assert "skill_floor_attempted_at IS NULL" in count_fn


def test_skill_kind_is_generated_and_cannot_be_hand_set() -> None:
    """The rule it replaces was hand-typed and three of its five names matched
    no cluster at all. A generated column cannot drift from the taxonomy."""
    sql = HARD_SOFT.read_text()

    assert "GENERATED ALWAYS AS" in sql
    assert "STORED" in sql
    assert "l1_domain = 'Physical and Inherent Abilities' THEN 'soft'" in sql


def test_communication_clusters_are_not_classified_soft() -> None:
    """They hold Post Office Protocol (POP3), Sendmail and Rocket Chat.

    Calling those soft would delete real technical requirements from every
    skill gap and from company demand — worse than leaving Body Language
    classified hard, because it removes signal instead of adding noise.
    """
    sql = HARD_SOFT.read_text()
    generated = sql.split("GENERATED ALWAYS AS")[1].split("STORED")[0]

    assert "Communication" not in generated


def test_non_family_clusters_asserts_its_literal_names_resolve() -> None:
    """The original bug was not that a list existed — it was that nobody
    checked the names resolved. Three named nothing and excluded nothing."""
    sql = HARD_SOFT.read_text()

    assert "RAISE EXCEPTION" in sql
    assert "no skill has that l2_cluster" in sql


def test_role_family_asks_the_taxonomy_instead_of_a_literal_list() -> None:
    sql = HARD_SOFT.read_text()
    fn = sql.split("CREATE OR REPLACE FUNCTION public.role_family_for_job")[1]

    assert "public.non_family_clusters()" in fn
    assert "excluded_role_families CONSTANT TEXT[]" not in fn


JUDGMENT = MIGRATIONS / "20260806i_stage_b_judgment_queue.sql"


def test_stage_b_claim_never_filters_on_the_description_column() -> None:
    """TOAST-reading job_description across 61,280 rows cost 94.6s and a 57014.

    20260806e had already removed this exact predicate from
    job_ids_missing_skill_floor, and it came back three hours later. Whether a
    job has usable text is decided in Python, after the claimed rows are
    fetched by primary key.
    """
    sql = JUDGMENT.read_text()
    claim = sql.split("CREATE OR REPLACE FUNCTION public.claim_jobs_for_skill_judgment")[1]
    candidates = claim.split("WITH candidates AS MATERIALIZED")[1].split("), claimed AS")[0]

    assert "job_description" not in candidates
    assert "FOR UPDATE SKIP LOCKED" in candidates


def test_stage_b_owns_only_its_own_attempt_column() -> None:
    sql = JUDGMENT.read_text()
    claim = sql.split("CREATE OR REPLACE FUNCTION public.claim_jobs_for_skill_judgment")[1]
    body = claim.split("$function$")[1]

    assert "SET skill_judged_at = now()" in body
    assert "enrichment_status" not in body
    # The work set is "standing on a deterministic floor", which
    # evidence_source already records — not a second definition of it.
    assert "evidence_source = 'stage_a'" in body


def test_the_judgment_backlog_counts_what_the_claim_serves() -> None:
    """It reported 61,280 against a claimable 5,309.

    Omitting the claim's own `evidence_source` predicate made the backlog count
    every job with any floor rather than every job standing on a DETERMINISTIC
    one — 56k of work that would never be dequeued, on a number that never
    moves however long the worker runs.
    """
    sql = JUDGMENT.read_text()
    counter = sql.split("CREATE OR REPLACE FUNCTION public.count_jobs_awaiting_judgment")[1]

    assert "evidence_source = 'stage_a'" in counter


def test_the_judgment_index_covers_the_columns_the_count_reads() -> None:
    """Without INCLUDE, the backlog count did 61,280 heap fetches — 29.5s."""
    sql = JUDGMENT.read_text()

    assert "INCLUDE (is_active, listing_confidence)" in sql


def test_the_judgment_claim_is_a_lease_that_can_be_released() -> None:
    """Stamped at claim and never released, it marked 50 prod jobs judged with
    zero verdicts and made them permanently ineligible. "We could not reach the
    model" is not an answer about the job."""
    sql = JUDGMENT_EVIDENCE.read_text()

    assert "release_skill_judgment_claim" in sql
    assert "interval '30 minutes'" in sql
    # A release must never discard a verdict that actually landed.
    release = sql.split("CREATE OR REPLACE FUNCTION public.release_skill_judgment_claim")[1]
    assert "evidence_source = 'judgment'" in release


def test_stage_b_verdicts_are_distinguishable_from_scraper_rows() -> None:
    """Stage B wrote its verdicts as 'enrichment', the scraper's own value.

    `job_skills` has no timestamp, so the two were indistinguishable once
    written. Both lease guards ask "did Stage B rule on this job"; answered from
    'enrichment', a 2026-04 scraper row answers yes on Stage B's behalf. Today
    only 5 jobs carry both, so it is right by accident — and stops being the
    moment ingest writes a scraper row onto a job that also has a floor.
    """
    sql = JUDGMENT_EVIDENCE.read_text()

    assert "'judgment'" in sql
    claim = sql.split("CREATE OR REPLACE FUNCTION public.claim_jobs_for_skill_judgment")[1]
    reclaim = claim.split("interval '30 minutes'")[1].split("AND EXISTS")[0]
    assert "evidence_source = 'judgment'" in reclaim
    assert "evidence_source = 'enrichment'" not in reclaim


def test_enrichment_no_longer_writes_job_skills() -> None:
    """It deleted Stage A's floor and replaced it with a constant.

        DELETE FROM public.job_skills WHERE job_id = p_job_id;
        INSERT ... SELECT p_job_id, skill_id, TRUE, required_level

    Enrichment runs after Stage A on a newly scraped job, so those two lines
    destroyed the JD-position read AND every Stage B verdict, then wrote
    `is_primary = TRUE` over the top. `has_skill_floor` stays true throughout,
    so Stage A never gets the job back — the 94.2%-constant corpus, rebuilt
    every scrape. 20260806b's `IF v_incoming > 0` guard only covered the EMPTY
    case; a normal enrichment still wiped a judged floor.
    """
    sql = FORWARD_FLOW.read_text()
    apply = sql.split("CREATE OR REPLACE FUNCTION public.apply_job_enrichment")[1]
    body = apply.split("$function$")[1]

    assert "DELETE FROM public.job_skills" not in body
    assert "INSERT INTO public.job_skills" not in body
    assert "main_skills" not in body, "main_skills is the trigger's, derived from job_skills"


def test_enrichment_status_does_not_report_on_another_stage() -> None:
    """`complete` must assert what ENRICHMENT produced, nothing else.

    20260806b made it assert a skill row, correctly, while enrichment was the
    skills writer. Kept after the split it inverts into the fault the ownership
    contract names: a job would be stamped `not_applicable` for the sole reason
    that Stage A had not run yet, releasing it on another stage's timing. The
    floor gap has its own owner — the dead-man heartbeat.
    """
    sql = FORWARD_FLOW.read_text()
    apply = sql.split("CREATE OR REPLACE FUNCTION public.apply_job_enrichment")[1]
    body = apply.split("$function$")[1]

    assert "v_final_skill_count" not in body
    assert "enrichment_status = 'complete'" in body
    # The summary/role_domain guard is what makes that `complete` a fact.
    assert "RETURN FALSE" in body


def test_main_skills_is_derived_from_job_skills() -> None:
    """Two answers to "what skills does this job need" is the coupling.

    Enrichment wrote `main_skills` (the chips, the skill facet, the gap) from
    its own list while `job_skills` (the matcher) came from somewhere else. It
    now derives in the trigger that already maintains role_family, so the chips
    a user sees and the rows the matcher ranks cannot disagree.
    """
    sql = FORWARD_FLOW.read_text()
    trigger = sql.split("CREATE OR REPLACE FUNCTION public.refresh_job_role_family")[1]

    assert "main_skills = resolved_main_skills" in trigger
    assert "job_skill.is_primary DESC" in trigger, "the zone leads the chip row"
    # A bare LIMIT over an unordered subquery takes 12 ARBITRARY rows and only
    # then ranks them, dropping must-haves at random.
    ordered_at = trigger.index("ORDER BY job_skill.is_primary DESC,\n                 job_skill.required_level")
    limit_at = trigger.index("LIMIT 12")
    assert ordered_at < limit_at


def test_the_pipeline_claim_rpcs_are_not_reachable_without_service_role() -> None:
    """All six were executable by `anon` until 2026-08-25.

    `claim_jobs_for_skill_floor` selects FOR UPDATE SKIP LOCKED and stamps the
    job's attempt column, so an unauthenticated caller could claim work off the
    ingest queue and mark it attempted without doing it: the queue drains, no
    skill floor is written, and nothing reports a failure because the work was
    handed out normally. `release_skill_judgment_claim` is the mirror — it
    releases claims for a caller-supplied job list.

    Revoking the role grants alone is not enough. PUBLIC carries a default
    EXECUTE grant on new functions and both roles inherit through it.
    """
    sql = WORKER_ONLY.read_text()
    worker_only = (
        "claim_jobs_for_skill_floor(integer)",
        "claim_jobs_for_skill_judgment(integer)",
        "release_skill_judgment_claim(text[])",
        "refresh_job_role_family()",
        "count_jobs_awaiting_judgment()",
        "count_jobs_missing_skill_floor()",
    )
    for signature in worker_only:
        revokes = [
            line for line in sql.splitlines()
            if line.startswith("revoke execute") and signature in line
        ]
        assert revokes, f"{signature} is never revoked"
        revoked_from = " ".join(revokes)
        for role in ("anon", "authenticated", "public"):
            assert role in revoked_from, f"{signature} still reachable via {role}"

    # The workers must keep it. A trigger function does not need EXECUTE to
    # fire, so refresh_job_role_family is deliberately not re-granted.
    for signature in worker_only:
        if signature == "refresh_job_role_family()":
            assert f"grant execute on function public.{signature} to service_role" not in sql
            continue
        assert f"grant execute on function public.{signature} to service_role" in sql
