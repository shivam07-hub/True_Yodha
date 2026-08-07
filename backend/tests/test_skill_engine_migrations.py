"""Contract locks on the skill-engine migrations.

Every assertion here is a property that was, at some point on 2026-08-06, wrong
in prod. They are cheap to keep and each one names what it cost.
"""

from pathlib import Path

MIGRATIONS = Path(__file__).parents[2] / "database/migrations"
ENRICHMENT = MIGRATIONS / "20260806b_enrichment_may_not_claim_complete_without_skills.sql"
FLOOR_QUEUE = MIGRATIONS / "20260806e_skill_floor_queue.sql"
HARD_SOFT = MIGRATIONS / "20260806h_hard_soft_derived.sql"


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
