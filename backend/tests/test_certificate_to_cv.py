"""Writing to someone's CV without asking. The rules that make that acceptable."""

from __future__ import annotations

from app.services.certificate_to_cv import MAX_CERT_LINES, apply_certificate


def _cert(level: int = 3, vid: str = "msk_new", name: str = "Cold Calling") -> dict:
    return {
        "skill_display_name": name,
        "achieved_level": level,
        "passed_at": "2026-08-30T10:00:00Z",
        "verification_id": vid,
    }


def test_an_empty_section_gets_the_line():
    certs, changed = apply_certificate([], _cert())

    assert changed is True
    assert len(certs) == 1
    assert "Cold Calling — Level 3 of 5" in certs[0]
    assert "applies it independently on real projects" in certs[0]


def test_levelling_up_replaces_in_place_rather_than_appending():
    """Five levels must not become five lines."""
    existing = [
        "B.Tech, 2019",
        "Cold Calling — Level 2 of 5: uses it on small tasks with guidance. "
        "Verified by Myro · Jul 2026 · myro.com/v/msk_old",
        "AWS Certified, 2024",
    ]

    certs, changed = apply_certificate(
        existing, _cert(level=3), prior_verification_ids={"msk_old"}
    )

    assert changed is True
    assert len(certs) == 3                      # replaced, not grown
    assert certs[0] == "B.Tech, 2019"           # order preserved
    assert certs[2] == "AWS Certified, 2024"
    assert "Level 3 of 5" in certs[1]
    assert "msk_old" not in certs[1]


def test_a_deleted_line_comes_back_on_the_next_level():
    """Shivam's call: a cleared level is permanent, so the pointer returns. The
    user cannot keep it off by deleting it — only by not levelling that skill."""
    certs, changed = apply_certificate(
        ["B.Tech, 2019"], _cert(level=4), prior_verification_ids={"msk_old"}
    )

    assert changed is True
    assert any("Level 4 of 5" in c for c in certs)


def test_a_promote_never_lowers_a_claim_already_on_the_cv():
    """An out-of-order or replayed job must not walk a Level 5 back to a 3."""
    existing = [
        "Cold Calling — Level 5 of 5: architects and mentors others, including "
        "failure modes. Verified by Myro · Aug 2026 · myro.com/v/msk_five"
    ]

    certs, changed = apply_certificate(
        existing, _cert(level=3), prior_verification_ids={"msk_five"}
    )

    assert changed is False
    assert certs == existing


def test_re_promoting_the_same_certificate_changes_nothing():
    certs, _ = apply_certificate([], _cert())
    again, changed = apply_certificate(certs, _cert())

    assert changed is False
    assert again == certs


def test_a_reworded_line_is_still_found_by_its_id():
    """The id survives the user editing everything around it."""
    existing = ["my cold calling cert (myro.com/v/msk_old) — level 2"]

    certs, changed = apply_certificate(
        existing, _cert(level=3), prior_verification_ids={"msk_old"}
    )

    assert changed is True
    assert len(certs) == 1
    assert "Level 3 of 5" in certs[0]


def test_a_line_that_merely_mentions_the_skill_is_left_alone():
    """Deleting a line we did not write is how a CV loses the user's own words."""
    existing = ["Led a cold calling team of six across two regions"]

    certs, changed = apply_certificate(existing, _cert(level=3))

    assert changed is True
    assert existing[0] in certs          # untouched
    assert len(certs) == 2               # ours added beside it


def test_another_skills_certificate_is_not_replaced():
    existing = [
        "Machine Learning — Level 4 of 5: handles edge cases, tradeoffs and "
        "non-trivial design. Verified by Myro · Aug 2026 · myro.com/v/msk_ml"
    ]

    certs, changed = apply_certificate(existing, _cert(level=3))

    assert changed is True
    assert len(certs) == 2
    assert any("Machine Learning" in c for c in certs)
    assert any("Cold Calling" in c for c in certs)


def test_a_full_section_is_not_grown_without_limit():
    """A CV is a document, not a log. Better to skip than to bury the reader."""
    existing = [f"Certificate {i}" for i in range(MAX_CERT_LINES)]

    certs, changed = apply_certificate(existing, _cert())

    assert changed is False
    assert certs == existing
