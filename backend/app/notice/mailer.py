"""Mailer port — closer only. observe() never mails (ADR-0021)."""

from __future__ import annotations

from typing import Protocol


class Mailer(Protocol):
    def send(self, *, subject: str, text: str) -> bool:
        ...


class SilentMailer:
    def send(self, *, subject: str, text: str) -> bool:
        return False


class RecordingMailer:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []

    def send(self, *, subject: str, text: str) -> bool:
        self.sent.append((subject, text))
        return True
