"""Stage A's matcher pays for a regex only where the literal occurs.

`re.search` with a string compiled through `re`'s 512-pattern cache while one
JD probes ~550 terms, so every term was recompiled for every job; and each of
~2,500 candidate terms then scanned the whole 5.7KB description. 603ms a job
on real JDs, 15.6ms after — identical output on 300 of them (2026-10-03). A
14k-job scrape outran the drain's two-hour timeout on the first cost alone.
"""

from __future__ import annotations

from app.services import skill_extraction as se


def test_a_term_is_compiled_once_and_kept() -> None:
    se._term_pattern.cache_clear()

    se._find("strong python skills", "python")
    se._find("python everywhere", "python")

    info = se._term_pattern.cache_info()
    assert (info.misses, info.hits) == (1, 1)


def test_an_absent_literal_never_reaches_the_regex() -> None:
    se._term_pattern.cache_clear()

    assert se._find("strong python skills", "kubernetes") is None
    assert se._term_pattern.cache_info().currsize == 0


def test_the_prefilter_does_not_loosen_the_guards() -> None:
    # A substring is necessary, never sufficient: the word guards still decide.
    assert se._find("javascript developer", "java") is None
    assert se._find("we use java.", "java") is not None
    assert se._find("c++ and c#", "c++") == (0, 3)
