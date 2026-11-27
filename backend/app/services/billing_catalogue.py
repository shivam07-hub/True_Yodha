"""The only place a price lives (ARCHITECTURE_PAYMENTS.md §3 A).

A product is looked up by the alias a client sends or by the key a
`billing_payments` row stores. An unknown name raises `UnknownProduct` — there
is never a default product, because a default is how an unknown order once
unlocked Myrology.

`xp_pack` is retired by ENG2: refused at create since S3, kept here so its old
orders still settle. The ₹199/month engagement was deleted in S5 (2026-11-23).
"""

from __future__ import annotations

from dataclasses import dataclass
from app.services import ai_workflow_audit, filing_intake, razorpay_gateway

CURRENCY = "INR"


class UnknownProduct(LookupError):
    """No product has this alias or key."""


@dataclass(frozen=True)
class Product:
    alias: str  # what a client sends: "myrology", "ai_workflow_audit", ...
    key: str  # what billing_payments.product stores
    price_paise: int
    coins: int  # coins the grant adds; 0 for an entitlement
    human_checks: int = 0  # Human Checks the grant opens (the Apply Pack: 1)


@dataclass(frozen=True)
class Availability:
    available: bool
    reason: str | None = None  # "not_configured" | "audit_full"


_PRODUCTS: tuple[Product, ...] = (
    # ENG2/ENG3: the closer. 500 coins and one Human Check (a CV read against a
    # job, or a LinkedIn rewrite).
    Product(alias="apply_pack", key="myro_apply_pack", price_paise=19900, coins=500, human_checks=1),
    Product(alias="xp_pack", key="myro_xp_launch_pack", price_paise=9900, coins=1000),
    Product(alias="myrology", key="myro_myrology_unlock", price_paise=29900, coins=0),
    Product(
        alias="ai_workflow_audit",
        key="myro_ai_workflow_audit",
        price_paise=ai_workflow_audit.AUDIT_PRICE_PAISE,
        coins=0,
    ),
    # ENG5: the ₹599 pack. Everything in the Apply Pack (500 coins, a CV
    # check) plus a check held for the LinkedIn rewrite, the search call, and
    # Myro filing on company pages — three calls in all.
    Product(
        alias="filing_intake",
        key="myro_filing_intake",
        price_paise=filing_intake.FILING_INTAKE_PRICE_PAISE,
        coins=500,
        human_checks=2,
    ),
)

_BY_ALIAS = {p.alias: p for p in _PRODUCTS}
_BY_KEY = {p.key: p for p in _PRODUCTS}

# Settles its old orders, never offered: `GET /api/catalogue` leaves it out.
_RETIRED = frozenset({"xp_pack"})


def listed() -> tuple[Product, ...]:
    """The products a client may render a buy button for."""
    return tuple(p for p in _PRODUCTS if p.alias not in _RETIRED)


def by_alias(alias: str) -> Product:
    try:
        return _BY_ALIAS[alias]
    except KeyError:
        raise UnknownProduct(alias) from None


def by_key(key: str) -> Product:
    try:
        return _BY_KEY[key]
    except KeyError:
        raise UnknownProduct(key) from None


def availability(product: Product) -> Availability:
    """Whether an order for `product` may be created now.

    Checked BEFORE the order, never after the payment: refusing to sell is
    recoverable, taking money for work the queue cannot absorb is not.
    """
    if not razorpay_gateway.configured():
        return Availability(False, "not_configured")
    if product.alias == "ai_workflow_audit" and not ai_workflow_audit.is_available():
        return Availability(False, "audit_full")
    return Availability(True)
