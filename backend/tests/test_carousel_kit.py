"""The carousel builder writes the kit from the spec. One fold, checked figures."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "build-newsletter-carousel.py"
BIO = (
    "https://www.himyro.com/"
    "?utm_source=instagram&utm_medium=social&utm_campaign=ig-bio"
)


def kit():
    spec = importlib.util.spec_from_file_location("carousel_kit", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_two_slide_fixture_writes_the_three_outputs() -> None:
    mod = kit()
    captions = ["First paragraph.\n\nSecond.", "Only one."]
    comment = "#jobsearch #niche #himyro"
    captions_txt, laptop_txt, section = mod.kit_texts(
        captions,
        comment,
        intro=(
            "## Instagram captions, one per slide\n\n"
            "Each caption is that slide's newsletter section.\n\n"
        ),
    )
    assert captions_txt == (
        "SLIDE 1\n"
        "First paragraph.\n\n"
        "Second.\n\n"
        "SLIDE 2\n"
        "Only one.\n\n"
        "FIRST COMMENT\n"
        "#jobsearch #niche #himyro\n\n"
        "BIO LINK (fixed, never changes)\n"
        f"{BIO}\n"
    )
    assert laptop_txt == (
        "First paragraph.\n\n"
        "Second.\n\n"
        "Only one.\n\n"
        "---\n"
        "FIRST COMMENT\n"
        "#jobsearch #niche #himyro\n\n"
        "BIO LINK (fixed, never changes)\n"
        f"{BIO}\n"
    )
    assert "Each caption is that slide's newsletter section." in section
    assert "### One caption, for the laptop\n\nFirst paragraph." in section
    assert section.endswith("Only one.\n")


def test_a_figure_missing_from_the_article_names_its_slide() -> None:
    mod = kit()
    with pytest.raises(SystemExit, match=r"slide 2.*\b9\b"):
        mod.check_captions(
            ["No number here.", "Nine roles, 9 of them."],
            "The article mentions nothing numeric.",
            "#jobsearch #niche #himyro",
        )


def test_a_year_is_not_a_hiring_figure() -> None:
    mod = kit()
    mod.check_captions(
        ["Employers were asked what they expect by 2030."],
        "The article never names that year.",
        "#jobsearch #niche #himyro",
    )


def test_folded_caption_over_2200_characters_fails() -> None:
    mod = kit()
    block = "word " * 500
    with pytest.raises(SystemExit, match="2,200"):
        mod.check_captions(
            [block, block],
            block,
            "#jobsearch #niche #himyro",
        )


@pytest.mark.parametrize("comment", ["#a #b", "#a #b #c #d #e #f"])
def test_hashtag_count_outside_three_to_five_fails(comment: str) -> None:
    mod = kit()
    with pytest.raises(SystemExit, match="hashtag"):
        mod.check_captions(["No figures."], "No figures.", comment)


def test_a_headline_sits_above_the_slide_evidence() -> None:
    mod = kit()
    body = mod.slide_body(
        {
            "kind": "table",
            "headline": "Your cloud work already counts.",
            "head": ["Roles that name it", ""],
            "rows": [["Cloud", "49.3%", True]],
        }
    )
    assert body.index('<h2 class="headline">Your cloud work already counts.</h2>') < body.index("<table>")
    assert "<th>Roles that name it</th>" in body


def test_a_slide_without_a_headline_renders_as_before() -> None:
    mod = kit()
    body = mod.slide_body({"kind": "number", "huge": "58.2%", "sub": "of roles."})
    assert "headline" not in body
