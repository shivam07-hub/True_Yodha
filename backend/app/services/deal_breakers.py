"""Deal-Breaker — what a person has said they will not take, read one way.

`user_profiles.deal_breakers` is the store: the person's own sentences, written
by the Pre-flight Order, Settings and onboarding through `targeting_write`. Two
kinds of sentence live there, and they are enforced differently on purpose.

- A **Pay Floor** ("less than 30 lakhs", "Pay floor ₹35 LPA") is a number. Pay
  is almost never printed on an Indian listing, so a floor NEVER hides a job
  (Shivam, 2026-09-28: "don't hide, guess from research and competitor
  salaries"). The brain estimates what each role pays; the card shows the band
  and says when it sits under the floor.
- A **Won't-Take** line ("Avoids early-stage start-ups") is judged by the brain,
  which names the lines a posting breaks by number. A broken line is a Skip,
  enforced in `llm_ranker.parse_eval` rather than trusted to the model — and a
  Skip is on no surface.

Before this module the list reached the brain as one comma-joined string, pay
included, and nothing downstream could tell which line a verdict honoured or
whether it honoured any. The pay regex lives here and `preflight/normalise`
imports it: one definition of "this sentence is about pay".
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

#: A sentence about pay. Shared with `preflight/normalise.refile`.
PAY = re.compile(
    r"(₹|\brs\.?\s*\d|\blakhs?\b|\blpa\b|\bctc\b|total comp|pay floor|\bcrores?\b)",
    re.I,
)

_UNIT = r"crores?|cr|lakhs?|lacs?|lpa|l"
_AMOUNT = re.compile(rf"(?P<num>\d[\d,]*(?:\.\d+)?)\s*(?P<unit>{_UNIT})?\b", re.I)
#: The unit a sentence is written in. Only the head of a range borrows it
#: ("35-40 LPA": the 35 takes the LPA) — "5+ years, above 30 lakhs" must not
#: read the 5 as lakhs. Long forms only, so a stray "l" is never lakhs.
_LINE_UNIT = re.compile(r"\b(crores?|lakhs?|lacs?|lpa)\b", re.I)
_RANGE_HEAD = re.compile(r"\s*(?:-|–|—|to)\s*\d", re.I)
#: A bare rupee amount at or over this is written in rupees, not lakhs.
_RUPEES = 100_000


def pay_floor_lpa(text: str) -> float | None:
    """The floor a pay sentence states, in lakhs per annum. None when it states none.

    A range states its lower end ("35-40 LPA" → 35). A number with no unit and
    no rupee scale is not money ("2 years") and is skipped.
    """
    if not PAY.search(text or ""):
        return None
    line = _LINE_UNIT.search(text)
    line_unit = line.group(1).lower() if line else ""
    values: list[float] = []
    for match in _AMOUNT.finditer(text):
        number = float(match.group("num").replace(",", ""))
        unit = (match.group("unit") or "").lower()
        if not unit and _RANGE_HEAD.match(text, match.end()):
            unit = line_unit
        if unit.startswith("cr"):
            values.append(number * 100)
        elif unit:
            values.append(number)
        elif number >= _RUPEES:
            values.append(number / _RUPEES)
    return min(values) if values else None


@dataclass(frozen=True)
class DealBreakers:
    #: The strictest floor stated, in LPA. Never a reason to hide a job.
    pay_floor_lpa: float | None
    #: Every non-pay line, in stored order. The brain answers by 1-based index.
    wont_take: tuple[str, ...]

    def broken(self, indices: list[int]) -> list[str]:
        """The lines a verdict says a posting breaks, as the words the person used."""
        return [
            self.wont_take[i - 1]
            for i in dict.fromkeys(indices)
            if 1 <= i <= len(self.wont_take)
        ]


def read(profile: dict[str, Any]) -> DealBreakers:
    """Split the stored sentences into the floor and the won't-take lines."""
    floors: list[float] = []
    wont: list[str] = []
    for raw in profile.get("deal_breakers") or []:
        text = str(raw or "").strip()
        if not text:
            continue
        if PAY.search(text):
            floor = pay_floor_lpa(text)
            if floor is not None:
                floors.append(floor)
            continue
        wont.append(text)
    return DealBreakers(
        pay_floor_lpa=max(floors) if floors else None,
        wont_take=tuple(wont),
    )


def below_floor(floor: float | None, high: float | None) -> bool | None:
    """True when even the top of the band is under the floor. None when either is unknown.

    The top, not the middle: a band that reaches the floor is a role the person
    can negotiate into, and calling it "below" would steer them off it.
    """
    if floor is None or high is None:
        return None
    return float(high) < float(floor)
