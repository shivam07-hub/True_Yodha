"""Band percentile persist ranks against the live formula via the admin pool.

A token-scoped scores repo can only see the caller's row, so Recalculate
would skip ranking (population of one) unless the peer read uses service role.
Nothing is written back onto peer rows.
"""

from unittest.mock import MagicMock

from app.services.scoring import orchestrator as orch


def test_persist_band_percentile_ranks_via_admin_not_token_repo(monkeypatch) -> None:
    token_repo = MagicMock()
    admin_db = object()
    captured: dict[str, object] = {}

    monkeypatch.setattr("app.database.get_supabase_admin", lambda: admin_db)

    class _Population:
        def __init__(self, db: object) -> None:
            captured["db"] = db

        def get_all_band_scores(self) -> list[tuple[str, float]]:
            return [("mid", 20.0), ("mid", 80.0)]

    monkeypatch.setattr(orch, "ScoresRepository", _Population)

    orch._persist_band_percentile(token_repo, "u1", "mid", 80.0)

    assert captured["db"] is admin_db
    token_repo.get_all_band_scores.assert_not_called()
    token_repo.update_percentile.assert_called_once()
    rank = token_repo.update_percentile.call_args.args[1]
    assert rank == 50.0
