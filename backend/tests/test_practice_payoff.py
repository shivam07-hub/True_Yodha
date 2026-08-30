"""The line that tells a user what their clear bought.

Its whole risk is overclaiming. A number here that reads as "you now match these
roles" is the same fabrication the no-fabrication guard exists to stop — the
user clears a bar on ONE skill, and the rest of the role is untouched.
"""

from __future__ import annotations

from postgrest.exceptions import APIError

from app.services.practice_payoff import roles_cleared


class _Result:
    def __init__(self, data):
        self.data = data


class _Rpc:
    def __init__(self, data, raises=False):
        self._data = data
        self._raises = raises

    def execute(self):
        if self._raises:
            raise APIError({"message": "boom"})
        return _Result(self._data)


class _Table:
    def __init__(self, profile):
        self._profile = profile

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return _Result(self._profile)


class _Admin:
    def __init__(self, rpc_data=None, *, profile=None, rpc_raises=False):
        self._rpc_data = rpc_data
        self._profile = profile if profile is not None else {"target_locations": ["Pune"]}
        self._rpc_raises = rpc_raises
        self.rpc_params: dict | None = None

    def table(self, _name):
        return _Table(self._profile)

    def rpc(self, _name, params):
        self.rpc_params = params
        return _Rpc(self._rpc_data, raises=self._rpc_raises)


def test_reports_the_delta_and_the_total():
    admin = _Admin([{"newly_met": 3, "met_total": 14, "total_asking": 40}])

    out = roles_cleared(admin, "u1", 7, from_level=1, to_level=2)

    assert out is not None
    assert out.newly_met == 3
    assert out.met_total == 14
    assert out.total_asking == 40


def test_says_nothing_when_no_live_role_asks_for_the_skill():
    """A "0 roles" line reads as a verdict on the user. It is a fact about the
    market, and the honest rendering of it is silence."""
    admin = _Admin([{"newly_met": 0, "met_total": 0, "total_asking": 0}])

    assert roles_cleared(admin, "u1", 7, from_level=0, to_level=1) is None


def test_a_clear_that_unlocked_nothing_new_still_reports_the_standing_total():
    """Zero delta is not zero value — the user should still see where they stand.
    Only an empty MARKET silences the line."""
    admin = _Admin([{"newly_met": 0, "met_total": 9, "total_asking": 30}])

    out = roles_cleared(admin, "u1", 7, from_level=3, to_level=4)

    assert out is not None and out.newly_met == 0 and out.met_total == 9


def test_a_failed_read_never_costs_the_user_their_result():
    """This decorates a score the user already earned. It must not raise."""
    admin = _Admin(None, rpc_raises=True)

    assert roles_cleared(admin, "u1", 7, from_level=1, to_level=2) is None


def test_empty_rpc_response_is_silence_not_a_crash():
    assert roles_cleared(_Admin([]), "u1", 7, from_level=1, to_level=2) is None


def test_scope_travels_as_the_users_saved_locations():
    admin = _Admin([{"newly_met": 1, "met_total": 1, "total_asking": 1}],
                   profile={"target_locations": ["Bengaluru", "Hyderabad"]})

    roles_cleared(admin, "u1", 7, from_level=1, to_level=2)

    assert admin.rpc_params["p_cities"] == ["Bengaluru", "Hyderabad"]
    assert admin.rpc_params["p_from_level"] == 1
    assert admin.rpc_params["p_to_level"] == 2


def test_a_user_with_no_saved_city_is_scoped_to_the_whole_market():
    """Not to nothing. An unscoped user is not a user with no options —
    the same mistake that told 162 users the market was empty."""
    admin = _Admin([{"newly_met": 2, "met_total": 5, "total_asking": 9}], profile={})

    out = roles_cleared(admin, "u1", 7, from_level=0, to_level=1)

    assert admin.rpc_params["p_cities"] == []
    assert out is not None and out.met_total == 5


def test_falls_back_to_the_single_saved_location():
    admin = _Admin([{"newly_met": 1, "met_total": 2, "total_asking": 3}],
                   profile={"target_locations": [], "target_location": "Pune"})

    roles_cleared(admin, "u1", 7, from_level=0, to_level=1)

    assert admin.rpc_params["p_cities"] == ["Pune"]
