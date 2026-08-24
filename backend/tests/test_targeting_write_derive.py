"""`targeting_write.derive` must not empty `target_roles` as a side effect.

CONTEXT.md calls `target_roles` the matcher's and aspiration ILIKE keys — the
feed's scoping column. `POST /preflight/run` projects an order into a patch that
carries `target_role_titles` but never the resolved role FAMILY (the payload
projector emits titles only). Before this contract, `derive()` handed those
title-only patches to `role_title_updates` and wrote `target_roles: []`, so
every signed-off Order silently zeroed the column the market reads.

Invariant 5 in `MYRO_SEARCH_REBUILD.md`: *`target_roles` is derived from role
titles and must never be emptied as a side effect. An empty scoping key tells
users the market has nothing.*
"""
from __future__ import annotations

from app.services import targeting_write


def test_derive_preserves_stored_target_roles_when_caller_omits_family() -> None:
    # The pre-flight path: `payload.project()` emits `target_role_titles` and
    # nothing else about role identity.
    patch = {"target_role_titles": ["Product Manager", "Product Lead"]}
    before = {
        "target_roles": ["product_management"],
        "target_role_titles": ["Product Manager"],
        "target_role_title": "Product Manager",
    }
    out = targeting_write.derive(patch, before)
    assert out["target_roles"] == ["product_management"], (
        "A pre-flight run must not empty the stored role family — the market "
        "scopes on `target_roles`, and writing [] tells the user the market "
        "has nothing (invariant 5)."
    )
    assert out["target_role_titles"] == ["Product Manager", "Product Lead"]
    assert out["target_role_title"] == "Product Manager"


def test_derive_writes_supplied_family_when_caller_provides_one() -> None:
    # Settings/profile edit: the corpus-backed role picker resolves a family and
    # supplies it explicitly. That IS a change and must be honored.
    patch = {
        "target_role_titles": ["Data Scientist"],
        "role_families": ["data_science"],
    }
    before = {"target_roles": ["product_management"]}
    out = targeting_write.derive(patch, before)
    assert out["target_roles"] == ["data_science"]


def test_derive_writes_supplied_family_singular_form() -> None:
    patch = {
        "target_role_titles": ["Data Scientist"],
        "role_family": "data_science",
    }
    before = {"target_roles": ["product_management"]}
    out = targeting_write.derive(patch, before)
    assert out["target_roles"] == ["data_science"]


def test_derive_writes_empty_family_when_caller_explicitly_says_none() -> None:
    # Explicit `role_families=[]` is a deliberate clear, not an omission.
    # (The pre-flight never sends this form; it comes from a settings edit that
    # cleared the family.) The caller took responsibility for the clear.
    patch = {
        "target_role_titles": ["Product Manager"],
        "role_families": [],
    }
    before = {"target_roles": ["product_management"]}
    out = targeting_write.derive(patch, before)
    assert out["target_roles"] == []


def test_derive_leaves_target_roles_alone_when_no_titles_supplied() -> None:
    # A patch that doesn't touch titles must not touch role_family either.
    patch = {"target_location": "Bengaluru"}
    before = {"target_roles": ["product_management"]}
    out = targeting_write.derive(patch, before)
    assert "target_roles" not in out
    assert out["target_location"] == "Bengaluru"


def test_derive_drops_a_raw_target_roles_supplied_alongside_titles() -> None:
    # The split-brain guard: `target_roles` MUST be derived from titles + family.
    # A caller that sends both means a client bypassing the writer contract; the
    # docstring calls this "the split-brain this rule exists to prevent".
    patch = {
        "target_role_titles": ["Product Manager"],
        "target_roles": ["engineering"],  # a lie — the client picked one arbitrarily
    }
    before = {"target_roles": ["product_management"]}
    out = targeting_write.derive(patch, before)
    # `target_roles: ["engineering"]` was dropped; the stored family survives.
    assert out["target_roles"] == ["product_management"]


def test_derive_refuses_to_empty_the_scoping_key_by_omission() -> None:
    """The 3-user state: titles stated, `target_roles` empty — so the feed and
    matcher scope on nothing and report it as "the market has nothing".

    An omitted family must never PRODUCE that. An explicit one still may (the
    test above), because there the caller took responsibility for the clear.
    """
    patch = {"target_role_titles": ["Product Manager"]}
    before = {"target_roles": []}
    out = targeting_write.derive(patch, before)
    assert "target_roles" not in out
    assert out["target_role_titles"] == ["Product Manager"]
