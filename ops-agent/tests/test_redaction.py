from myro_ops.redaction import redact_sensitive


def test_redacts_email_tokens_jwt_and_uuid() -> None:
    text = (
        "Email shivam@example.com token sk-live-1234567890 "
        "jwt eyJhbGciOiJIUzI1NiJ9.abc.def "
        "user 8347d70c-fd70-4427-a0a8-d38dbc45757d"
    )

    redacted = redact_sensitive(text)

    assert "shivam@example.com" not in redacted
    assert "sk-live-1234567890" not in redacted
    assert "eyJhbGciOiJIUzI1NiJ9.abc.def" not in redacted
    assert "8347d70c-fd70-4427-a0a8-d38dbc45757d" not in redacted
    assert "[redacted-email]" in redacted
    assert "[redacted-secret]" in redacted
    assert "[redacted-jwt]" in redacted
    assert "[redacted-uuid]" in redacted
