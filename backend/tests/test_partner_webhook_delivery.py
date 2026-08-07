"""Partner webhook signing, endpoint validation, and the retry ladder.

The url check is a server-side-request-forgery gate: a partner supplies the
address, and our backend is the one that connects to it. It runs at registration
so a bad url is a 422 to the partner, never a surprise request from inside our
network.
"""
from __future__ import annotations

import hashlib
import hmac
import socket

import pytest

from app.repositories.partner_delivery import (
    MAX_ATTEMPTS,
    RETRY_INTERVALS_SECONDS,
)
from app.services import partner_webhooks


def test_signature_is_hmac_over_timestamp_and_body():
    secret = "whsec_test"
    body = '{"a":1}'
    header = partner_webhooks.sign(secret, timestamp=1700000000, body=body)

    prefix, digest = header.split(",")
    assert prefix == "t=1700000000"
    expected = hmac.new(
        secret.encode(), b"1700000000." + body.encode(), hashlib.sha256
    ).hexdigest()
    assert digest == f"v1={expected}"


def test_signature_changes_with_the_body():
    a = partner_webhooks.sign("s", timestamp=1, body='{"a":1}')
    b = partner_webhooks.sign("s", timestamp=1, body='{"a":2}')
    assert a != b


@pytest.mark.parametrize(
    "url",
    [
        "http://partner.example/hook",   # not https
        "ftp://partner.example/hook",
        "not-a-url",
        "",
    ],
)
def test_non_https_urls_are_refused(url):
    with pytest.raises(partner_webhooks.InvalidWebhookUrl):
        partner_webhooks.validate_url(url)


def test_private_addresses_are_refused(monkeypatch):
    """A partner must not be able to aim our backend at our own network."""
    monkeypatch.setattr(
        socket, "getaddrinfo",
        lambda *a, **k: [(2, 1, 6, "", ("10.0.0.5", 443))],
    )
    with pytest.raises(partner_webhooks.InvalidWebhookUrl):
        partner_webhooks.validate_url("https://internal.partner.example/hook")


def test_a_single_private_answer_poisons_a_public_host(monkeypatch):
    """DNS rebinding: one public answer does not make the host safe."""
    monkeypatch.setattr(
        socket, "getaddrinfo",
        lambda *a, **k: [
            (2, 1, 6, "", ("93.184.216.34", 443)),
            (2, 1, 6, "", ("169.254.169.254", 443)),  # cloud metadata
        ],
    )
    with pytest.raises(partner_webhooks.InvalidWebhookUrl):
        partner_webhooks.validate_url("https://rebind.partner.example/hook")


def test_public_address_is_accepted(monkeypatch):
    monkeypatch.setattr(
        socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("93.184.216.34", 443))]
    )
    assert partner_webhooks.validate_url("https://partner.example/hook ") == (
        "https://partner.example/hook"
    )


def test_unresolvable_host_is_refused(monkeypatch):
    def _boom(*_a, **_k):
        raise socket.gaierror("nope")

    monkeypatch.setattr(socket, "getaddrinfo", _boom)
    with pytest.raises(partner_webhooks.InvalidWebhookUrl):
        partner_webhooks.validate_url("https://nowhere.partner.example/hook")


def test_signing_secrets_are_unique():
    assert partner_webhooks.generate_signing_secret() != partner_webhooks.generate_signing_secret()


def test_retry_ladder_is_finite_and_growing():
    """A partner outage must end in a terminal 'failed', never an endless retry."""
    assert MAX_ATTEMPTS == len(RETRY_INTERVALS_SECONDS) + 1
    assert list(RETRY_INTERVALS_SECONDS) == sorted(RETRY_INTERVALS_SECONDS)
    assert RETRY_INTERVALS_SECONDS[-1] >= 3600
