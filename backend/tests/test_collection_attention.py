from datetime import datetime, timedelta, timezone

from app.services.collection_attention import _autofollow_company, _copy, _target_level


NOW = datetime(2026, 7, 19, tzinfo=timezone.utc)


class _FakeUsersRepo:
    def __init__(self, followed: list[str]) -> None:
        self.followed = [{"company_name": name} for name in followed]
        self.follow_calls: list[str] = []

    def get_followed_companies(self, user_id: str) -> list[dict]:
        return self.followed

    def follow_company(self, user_id: str, company_name: str) -> None:
        self.follow_calls.append(company_name)
        self.followed.append({"company_name": company_name})


def test_autofollow_follows_company_with_room() -> None:
    repo = _FakeUsersRepo(followed=[])
    _autofollow_company(repo, "user-1", "Deloitte")
    assert repo.follow_calls == ["Deloitte"]


def test_autofollow_skips_when_already_following_case_insensitive() -> None:
    repo = _FakeUsersRepo(followed=["deloitte "])
    _autofollow_company(repo, "user-1", "Deloitte")
    assert repo.follow_calls == []


def test_autofollow_skips_silently_at_cap() -> None:
    repo = _FakeUsersRepo(followed=[f"Company {i}" for i in range(10)])
    _autofollow_company(repo, "user-1", "New Co")
    assert repo.follow_calls == []


def test_autofollow_skips_missing_company_name() -> None:
    repo = _FakeUsersRepo(followed=[])
    _autofollow_company(repo, "user-1", None)
    _autofollow_company(repo, "user-1", "  ")
    assert repo.follow_calls == []


def test_saved_attention_advances_through_each_checkpoint() -> None:
    assert _target_level(NOW - timedelta(hours=23), NOW) is None
    assert _target_level(NOW - timedelta(days=1), NOW) == "review"
    assert _target_level(NOW - timedelta(days=3), NOW) == "decide"
    assert _target_level(NOW - timedelta(days=7), NOW) == "urgent"


def test_urgent_attention_uses_live_listing_language_without_invented_deadline() -> None:
    title, body = _copy("urgent", "Product Designer", "Myro")

    assert title == "Decide on this saved role today"
    assert body == "Myro · Product Designer is still live. Open Collections to tailor, apply, or pass."
    assert "closes" not in body
