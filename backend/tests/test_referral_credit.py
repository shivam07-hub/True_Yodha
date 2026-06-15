"""Tests for the one-time SH7 referral reward."""

from __future__ import annotations

from typing import Any

from app.services import user_provisioning


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _ReferralRewardSpy:
    def __init__(
        self,
        *,
        new_user_id: str,
        referred_by_user_id: str | None,
        welcome_xp_granted: bool,
    ) -> None:
        self.new_user_id = new_user_id
        self.referred_by_user_id = referred_by_user_id
        self.welcome_xp_granted = welcome_xp_granted
        self.rewarded = False
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []
        self._table: str | None = None
        self._filters: dict[str, Any] = {}

    def table(self, name: str) -> "_ReferralRewardSpy":
        self._table = name
        self._filters = {}
        return self

    def select(self, *_args: Any, **_kwargs: Any) -> "_ReferralRewardSpy":
        return self

    def eq(self, column: str, value: Any) -> "_ReferralRewardSpy":
        self._filters[column] = value
        return self

    def gt(self, column: str, value: Any) -> "_ReferralRewardSpy":
        self._filters[column] = (">", value)
        return self

    def limit(self, _count: int) -> "_ReferralRewardSpy":
        return self

    def maybe_single(self) -> "_ReferralRewardSpy":
        return self

    def rpc(self, name: str, params: dict[str, Any]) -> "_ReferralRewardSpy":
        self.rpc_calls.append((name, params))
        self.rewarded = True
        return self

    def execute(self) -> _Result:
        if self._table == "user_profiles":
            return _Result({
                "id": self.new_user_id,
                "referred_by_user_id": self.referred_by_user_id,
                "welcome_xp_granted": self.welcome_xp_granted,
            })
        if self._table == "xp_ledger":
            return _Result([{"id": 1}] if self.rewarded else [])
        if self.rpc_calls:
            return _Result(3100)
        return _Result(None)


def test_referral_credit_blocks_self_referral(monkeypatch: Any) -> None:
    spy = _ReferralRewardSpy(
        new_user_id="self-user",
        referred_by_user_id="self-user",
        welcome_xp_granted=True,
    )
    monkeypatch.setattr(user_provisioning, "get_supabase_admin", lambda: spy)

    paid = user_provisioning.credit_referrer_for_signup("self-user")

    assert paid == 0
    assert spy.rpc_calls == []


def test_referral_credit_pays_once_and_replay_pays_zero(monkeypatch: Any) -> None:
    spy = _ReferralRewardSpy(
        new_user_id="new-user",
        referred_by_user_id="referrer-user",
        welcome_xp_granted=True,
    )
    monkeypatch.setattr(user_provisioning, "get_supabase_admin", lambda: spy)

    first_paid = user_provisioning.credit_referrer_for_signup("new-user")
    replay_paid = user_provisioning.credit_referrer_for_signup("new-user")

    assert first_paid == 100
    assert replay_paid == 0
    assert spy.rpc_calls == [(
        "reward_coins",
        {
            "p_user_id": "referrer-user",
            "p_amount": 100,
            "p_action": "referral_credit",
            "p_reason": "Referral signup completed",
            "p_ref_table": "referred_signup",
            "p_ref_id": "new-user",
        },
    )]


def test_referral_credit_without_referrer_is_noop(monkeypatch: Any) -> None:
    spy = _ReferralRewardSpy(
        new_user_id="new-user",
        referred_by_user_id=None,
        welcome_xp_granted=True,
    )
    monkeypatch.setattr(user_provisioning, "get_supabase_admin", lambda: spy)

    paid = user_provisioning.credit_referrer_for_signup("new-user")

    assert paid == 0
    assert spy.rpc_calls == []
