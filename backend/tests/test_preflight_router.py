"""The pre-flight's HTTP shape — specifically, what each read is allowed to cost.

`GET /preflight/order` renders a modal. `GET /preflight/price` decides what one
button says. They used to be the same request, and the second half is the slow
half: `count_new_jobs_for_user` is a count over `jobs` since the user's marker
that read-timed-out at 8s four times in one hour of prod logs (2026-08-21), so
the plates, the say band and every edit waited on a number nobody had asked for.
The modal opened in 9.0-10.5s against a 500ms p95 read contract.

Splitting them is only true if `/order` never reaches the count. That is what
this file asserts.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.jobs import get_token_jobs_repository
from app.services.preflight.lines import Order
from app.services.preflight.repository import OrderBundle, get_order_repository

USER = "11111111-1111-1111-1111-111111111111"


class _CountingJobsRepo:
    """Records every inventory count. The point of the test is that `/order`
    makes none."""

    def __init__(self, new_jobs: int = 0) -> None:
        self.counts = 0
        self._new_jobs = new_jobs

    def count_new_jobs_for_user(self, user_id: str) -> int:
        self.counts += 1
        return self._new_jobs


class _FakeOrders:
    def __init__(self, bundle: OrderBundle) -> None:
        self._bundle = bundle

    def load_bundle(self, user_id: str) -> OrderBundle:
        return self._bundle


def _client(*, orders: _FakeOrders, repo: _CountingJobsRepo) -> TestClient:
    app.dependency_overrides[get_principal] = lambda: Principal(id=USER, token="t")
    app.dependency_overrides[get_order_repository] = lambda: orders
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    return TestClient(app)


def _bundle() -> OrderBundle:
    return OrderBundle(order=Order(said="tech sales"), memory_count=0, cv_readiness="ready")


def teardown_function() -> None:
    app.dependency_overrides.clear()


def test_the_order_read_never_touches_the_inventory_count():
    repo = _CountingJobsRepo(new_jobs=42)
    client = _client(orders=_FakeOrders(_bundle()), repo=repo)

    body = client.get("/preflight/order").json()

    assert repo.counts == 0, "the slow count is back on the modal's critical path"
    assert body["said"] == "tech sales"
    assert "slots" in body, "the order still carries the resolver's partition"
    # And it carries no price — a client reading one off this response would be
    # reading a field that is no longer maintained here.
    assert "run_cost" not in body
    assert "new_jobs_count" not in body


def test_the_price_is_its_own_read_and_states_the_waiver():
    repo = _CountingJobsRepo(new_jobs=42)
    client = _client(orders=_FakeOrders(_bundle()), repo=repo)

    body = client.get("/preflight/price").json()

    assert repo.counts == 1
    # Myro landed roles this user has never been matched against → free.
    assert body == {"run_cost": 0, "new_jobs_count": 42}


def test_no_new_inventory_prices_the_run_at_the_flat_cost():
    from app.services.xp_policy import MATCH_RUN_COST

    repo = _CountingJobsRepo(new_jobs=0)
    client = _client(orders=_FakeOrders(_bundle()), repo=repo)

    assert client.get("/preflight/price").json() == {
        "run_cost": MATCH_RUN_COST,
        "new_jobs_count": 0,
    }


class _TimingOutJobsRepo:
    """The count that read-timed-out four times in one hour of prod logs."""

    def count_new_jobs_for_user(self, user_id: str) -> int:
        raise TimeoutError("The read operation timed out")


def test_a_run_we_cannot_price_is_free_not_a_hundred_coins():
    """`count_for_user` swallowed the timeout and returned 0 — and 0 is the
    value that charges `MATCH_RUN_COST`. Every one of those four timeouts would
    have billed a user 100 coins because our database was slow.

    Absence is not a verdict. We failed to compute it, so we do not charge for
    it (Shivam, 2026-08-22).
    """
    client = _client(orders=_FakeOrders(_bundle()), repo=_TimingOutJobsRepo())

    body = client.get("/preflight/price").json()

    assert body["run_cost"] == 0
    # And nothing to announce — unknown is not "0 new roles" either.
    assert body["new_jobs_count"] == 0


def test_the_waiver_is_one_rule_shared_by_the_quote_and_the_charge():
    """Three surfaces price a run. When they drift, a user is quoted one number
    and billed another."""
    from app.services import new_inventory

    assert new_inventory.waives_charge(None) is True, "unknown waives"
    assert new_inventory.waives_charge(7) is True, "new inventory waives"
    assert new_inventory.waives_charge(0) is False, "caught up — a real second search"
