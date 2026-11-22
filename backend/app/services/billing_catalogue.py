"""The only place a price lives (ARCHITECTURE_PAYMENTS.md §3 A).

A product is looked up by the alias a client sends or by the key a
`billing_payments` row stores. An unknown name raises `UnknownProduct` — there
is never a default product, because a default is how an unknown order once
unlocked Myrology.

`xp_pack` and `job_switch_plan` are retired by ENG2 but stay sellable until the
Apply Pack checkout replaces their buttons (S3) and the subscription code is
deleted (S5). Refusing them first would leave two buy buttons the server turns
down.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

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
    billing: Literal["order", "subscription"] = "order"


@dataclass(frozen=True)
class Availability:
    available: bool
    reason: str | None = None  # "not_configured" | "audit_full"


_PRODUCTS: tuple[Product, ...] = (
    Product(alias="xp_pack", key="myro_xp_launch_pack", price_paise=9900, coins=1000),
    Product(alias="myrology", key="myro_myrology_unlock", price_paise=29900, coins=0),
    Product(
        alias="job_switch_plan",
        key="myro_job_switch_plan",
        price_paise=19900,
        coins=0,
        billing="subscription",
    ),
    Product(
        alias="ai_workflow_audit",
        key="myro_ai_workflow_audit",
        price_paise=ai_workflow_audit.AUDIT_PRICE_PAISE,
        coins=0,
    ),
    Product(
        alias="filing_intake",
        key="myro_filing_intake",
        price_paise=filing_intake.FILING_INTAKE_PRICE_PAISE,
        coins=0,
    ),
)

_BY_ALIAS = {p.alias: p for p in _PRODUCTS}
_BY_KEY = {p.key: p for p in _PRODUCTS}


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
