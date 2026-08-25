"""Unit tests for the per-bullet rewrite (cv_rewrite) — the Mentor core loop.

Logic + the grounding path + the reservoir-first-number guard. The grounding seam
(`mentor_grounding.assemble`) and the LLM provider are faked — no network, no real
model. The writer floor is owned inside the service; tests pass a fake provider as
the documented test-only override.
"""
import asyncio
from dataclasses import dataclass

from app.services import cv_rewrite
from app.services.mentor_grounding import CandidateMetric, MentorGrounding


@dataclass
class _Passage:
    chunk_text: str
    source_title: str
    source_id: str = "myro-cv-playbook-v1"
    source_url: str | None = None
    similarity: float = 0.9


class _FakeProvider:
    # Default reply reuses ONLY the source's figures — a fake that invents "team of
    # 12" now (correctly) trips the foreign-number guard.
    def __init__(self, text="Cut churn 18% by shipping a lifecycle retention flow"):
        self._text = text
        self.last_messages = None

    async def complete(self, messages, max_tokens=0, temperature=None):
        self.last_messages = messages
        return self._text


class _DeadProvider:
    async def complete(self, messages, max_tokens=0, temperature=None):
        raise cv_rewrite.LLMProviderError("all providers down")


def _grounding(passages=None, stories=None, candidate_metrics=None) -> MentorGrounding:
    return MentorGrounding(
        passages=passages or [],
        stories=stories or [],
        candidate_metrics=candidate_metrics or [],
    )


def _patch_grounding(monkeypatch, grounding: MentorGrounding):
    """Patch the one grounding seam cv_rewrite composes, so no network runs."""
    async def fake_assemble(query, *, user_id=None, shelf="cv", passage_k=3, story_k=3):
        return grounding

    monkeypatch.setattr(cv_rewrite.mentor_grounding, "assemble", fake_assemble)


# ── metric guard ─────────────────────────────────────────────────────────────

def test_has_metric_detects_numbers_and_magnitudes():
    assert cv_rewrite.has_metric("Cut churn 18% in two quarters")
    assert cv_rewrite.has_metric("Saved ₹4 lakh annually")
    assert cv_rewrite.has_metric("Grew users to 40k")
    assert cv_rewrite.has_metric("Shipped over 3 months")
    assert cv_rewrite.has_metric("Led a team of 12")


def test_has_metric_false_for_vague_bullets():
    assert not cv_rewrite.has_metric("Worked with engineering on delivery")
    assert not cv_rewrite.has_metric("Responsible for the product roadmap")
    assert not cv_rewrite.has_metric("")


def test_should_ask_for_metric_guard():
    assert cv_rewrite.should_ask_for_metric("Owned the roadmap", None) is True
    assert cv_rewrite.should_ask_for_metric("Owned the roadmap", "activation 22%→31%") is False
    assert cv_rewrite.should_ask_for_metric("Cut churn 18%", None) is False


def test_build_messages_includes_role_metric_and_keywords():
    msgs = cv_rewrite._build_messages(
        "Owned the roadmap",
        role="Senior PM",
        missing_keywords=["A/B testing", "SQL"],
        metric="shipped 9 releases",
    )
    user = msgs[-1]["content"]
    assert "Senior PM" in user
    assert "shipped 9 releases" in user
    assert "A/B testing" in user
    assert "never invent" in msgs[0]["content"].lower()


# ── no-fabrication branch ────────────────────────────────────────────────────

def test_suggest_rewrite_returns_question_when_no_metric(monkeypatch):
    _patch_grounding(monkeypatch, _grounding())  # no stories → no candidate number
    out = asyncio.run(cv_rewrite.suggest_rewrite("Owned the roadmap", None, [], None))
    assert out["mode"] == "question"
    assert out["question"]


def test_suggest_rewrite_empty_bullet_is_error():
    out = asyncio.run(cv_rewrite.suggest_rewrite("   ", None, [], None))
    assert out["mode"] == "error"


def test_dead_provider_yields_graceful_error(monkeypatch):
    # Has a metric → guard passes → the (test-injected) provider fails → graceful error.
    _patch_grounding(monkeypatch, _grounding())
    out = asyncio.run(cv_rewrite.suggest_rewrite("Cut churn 18%", None, [], None, provider=_DeadProvider()))
    assert out["mode"] == "error"


# ── reservoir-first number (Q5) ──────────────────────────────────────────────

def test_reservoir_first_offers_the_users_own_number(monkeypatch):
    # A metric-less bullet, but the user's stories hold a real number → offer it with
    # provenance (suggest_metric), never a blank ask, never an invented figure.
    _patch_grounding(monkeypatch, _grounding(
        candidate_metrics=[CandidateMetric(value="40%", story_id="s1", story_title="Sales bots")],
    ))
    out = asyncio.run(cv_rewrite.suggest_rewrite("Owned the sales-proposal flow", None, [], None))
    assert out["mode"] == "suggest_metric"
    assert out["candidate_value"] == "40%"
    assert out["candidate_source"] == "Sales bots"
    assert "40%" in out["question"] and "Sales bots" in out["question"]


def test_no_reservoir_number_falls_to_the_question(monkeypatch):
    _patch_grounding(monkeypatch, _grounding())  # stories present but no number
    out = asyncio.run(cv_rewrite.suggest_rewrite("Owned the roadmap", None, [], None))
    assert out["mode"] == "question"


# ── grounding injection ──────────────────────────────────────────────────────

def test_build_messages_injects_grounding():
    g = _grounding([_Passage("Start every bullet with a strong action verb.", "Myro CV Playbook")])
    sys_grounded = cv_rewrite._build_messages("Cut churn 18%", None, [], None, g)[0]["content"]
    assert "strong action verb" in sys_grounded
    assert "Myro CV Playbook" in sys_grounded
    # No grounding → static STAR/XYZ guidance instead.
    sys_static = cv_rewrite._build_messages("Cut churn 18%", None, [], None, None)[0]["content"]
    assert "XYZ" in sys_static or "STAR" in sys_static
    assert "strong action verb" not in sys_static


def test_grounded_rewrite_surfaces_citations(monkeypatch):
    provider = _FakeProvider()
    _patch_grounding(monkeypatch, _grounding([
        _Passage("Quantify impact, and never invent the number.", "Myro CV Playbook"),
        _Passage("Tailor the bullet to the target job description.", "Myro CV Playbook"),
    ]))
    out = asyncio.run(cv_rewrite.suggest_rewrite("Cut churn 18%", "Senior PM", [], None, provider=provider))
    assert out["mode"] == "rewrite"
    assert out["citations"] == ["Myro CV Playbook"]           # de-duped internal record
    assert "never invent the number" in provider.last_messages[0]["content"]


def test_rewrite_failsoft_when_grounding_empty(monkeypatch):
    provider = _FakeProvider()
    _patch_grounding(monkeypatch, _grounding())               # RAG down / empty corpus
    out = asyncio.run(cv_rewrite.suggest_rewrite("Cut churn 18%", None, [], None, provider=provider))
    assert out["mode"] == "rewrite"
    assert out["citations"] == []
    sys = provider.last_messages[0]["content"]
    assert "XYZ" in sys or "STAR" in sys                      # fell back to static guidance


# ── recommended + alternates ─────────────────────────────────────────────────

_VARIANTS_RAW = (
    "[METRIC] Cut churn 18% by shipping a lifecycle retention flow || leads with the 18% cut\n"
    "[IMPACT] Reversed an 18% churn trend by owning a new lifecycle flow || shows the business win\n"
    "[SCOPE] Owned the churn program end to end, cutting it 18% || shows the scope you owned"
)


def test_variants_recommended_first_with_reasons(monkeypatch):
    provider = _FakeProvider(text=_VARIANTS_RAW)
    _patch_grounding(monkeypatch, _grounding([_Passage("Quantify impact.", "Myro CV Playbook")]))
    out = asyncio.run(cv_rewrite.suggest_rewrite_variants("Cut churn 18%", "Senior PM", [], None, provider=provider))
    assert out["mode"] == "variants"
    # Emitted order preserved → variants[0] is the recommendation.
    assert [v["angle"] for v in out["variants"]] == ["metric", "impact", "scope"]
    assert out["variants"][0]["why"] == "leads with the 18% cut"
    assert all(v["text"] and "[" not in v["text"] and "||" not in v["text"] for v in out["variants"])
    assert out["citations"] == ["Myro CV Playbook"]


def test_variants_strongest_first_honours_model_order(monkeypatch):
    # Model puts SCOPE first as its recommendation → we keep that order.
    raw = (
        "[SCOPE] Owned the churn program end to end, cutting it 18% || biggest scope\n"
        "[METRIC] Cut churn 18% with a lifecycle retention flow || leads with the number\n"
        "[IMPACT] Reversed an 18% churn trend || the business win"
    )
    _patch_grounding(monkeypatch, _grounding())
    out = asyncio.run(cv_rewrite.suggest_rewrite_variants("Cut churn 18%", None, [], None, provider=_FakeProvider(text=raw)))
    assert [v["angle"] for v in out["variants"]] == ["scope", "metric", "impact"]


def test_variants_share_no_fabrication_question(monkeypatch):
    _patch_grounding(monkeypatch, _grounding())
    out = asyncio.run(cv_rewrite.suggest_rewrite_variants("Owned the roadmap", None, [], None))
    assert out["mode"] == "question"


def test_variants_fall_back_to_single_when_untagged(monkeypatch):
    provider = _FakeProvider(text="Cut churn 18% by shipping a retention flow")  # no tags
    _patch_grounding(monkeypatch, _grounding())
    out = asyncio.run(cv_rewrite.suggest_rewrite_variants("Cut churn 18%", None, [], None, provider=provider))
    assert out["mode"] == "variants"
    assert len(out["variants"]) == 1
    assert out["variants"][0]["text"].startswith("Cut churn 18%")


def test_variants_dropping_source_numbers_are_filtered(monkeypatch):
    raw = (
        "[METRIC] Generated 50 outbound AI pitches building a revenue pipeline || leads with 50\n"
        "[IMPACT] Generated numerous outbound AI pitches for GCC clients || the business win\n"  # dropped 50 → filtered
        "[SCOPE] Owned outbound AI pitching across 50 GCC accounts || the scope"
    )
    _patch_grounding(monkeypatch, _grounding())
    out = asyncio.run(cv_rewrite.suggest_rewrite_variants(
        "Generated over 50 outbound AI pitches", None, [], None, provider=_FakeProvider(text=raw)))
    assert out["mode"] == "variants"
    assert [v["angle"] for v in out["variants"]] == ["metric", "scope"]


def test_all_variants_losing_metrics_is_an_error(monkeypatch):
    provider = _FakeProvider(text=(
        "[METRIC] Generated numerous pitches\n[IMPACT] Drove many pitches\n[SCOPE] Owned several pitches"
    ))
    _patch_grounding(monkeypatch, _grounding())
    out = asyncio.run(cv_rewrite.suggest_rewrite_variants(
        "Generated over 50 outbound pitches", None, [], None, provider=provider))
    assert out["mode"] == "error"
    assert "kept your original" in out["rationale"]


# ── substance guard (the Capgemini + Azure regressions, 2026-07-16) ─────────

_CAPGEMINI = (
    "Delivered €500K+ revenue last year by shaping India Cloud leverage B2B GTM "
    "strategy for GCC clients, aligning India insights with global MNCs through "
    "targeted personal meetings & delivery execution, and delivering a cross-BU "
    "pitch for Life Sciences, Energy, and Aerospace clients."
)

_AZURE = (
    "Led Platform Transformation & reduced platform maintenance spend by ~30% "
    "through shifting from legacy to Azure infrastructure. Reduced client costs by "
    "~20% via expense-tracking KPIs on property dashboards"
)


def test_loses_substance_catches_the_capgemini_truncation():
    # The live regression: number kept, everything named dropped.
    bad = "Generated €500K+ revenue by shaping India Cloud B2B GTM strategy"
    assert cv_rewrite.loses_substance(_CAPGEMINI, bad) is True


def test_loses_substance_passes_a_preserving_tighten():
    good = (
        "Delivered €500K+ revenue in a year by shaping India Cloud B2B GTM strategy "
        "for GCC clients — aligning India insights with global MNCs and pitching "
        "cross-BU wins across Life Sciences, Energy, and Aerospace."
    )
    assert cv_rewrite.loses_substance(_CAPGEMINI, good) is False


def test_sentence_initial_capitals_are_not_entities():
    # "Led"/"Reduced" open their sentences — grammar, not names. A rewrite saying
    # "reducing" instead of "Reduced" must NOT be rejected for it.
    ents = cv_rewrite._entities_in(_AZURE)
    assert "led" not in ents and "reduced" not in ents
    assert {"platform", "transformation", "azure", "kpi"} <= ents


def test_loses_substance_catches_the_azure_kpi_drop():
    # The screenshot-2 reframe: kept both %s, silently dropped the KPIs clause.
    bad = (
        "Led platform transformation to Azure infrastructure, reducing spend by "
        "~30% and client costs by ~20%"
    )
    assert cv_rewrite.loses_substance(_AZURE, bad) is True


def test_dropped_specifics_names_the_lost_entities():
    # Powers the eyes-open merge card: what a lossy merge would cost, by name.
    bad = "Generated €500K+ revenue by shaping India Cloud B2B GTM strategy"
    drops = cv_rewrite.dropped_specifics(_CAPGEMINI, bad)
    assert "GCC" in drops and "MNCs" in drops  # display-cased, source order


def test_dropped_specifics_reports_a_missing_number():
    drops = cv_rewrite.dropped_specifics("Sold $500K of GCP to clients", "Sold GCP to clients")
    assert any("500" in d for d in drops)


def test_dropped_specifics_empty_when_nothing_lost():
    good = (
        "Delivered €500K+ revenue in a year by shaping India Cloud B2B GTM strategy "
        "for GCC clients — aligning India insights with global MNCs and pitching "
        "cross-BU wins across Life Sciences, Energy, and Aerospace."
    )
    assert cv_rewrite.dropped_specifics(_CAPGEMINI, good) == []


def test_gains_foreign_numbers_blocks_minted_figures():
    src = "Improved client onboarding for GCC accounts"
    assert cv_rewrite.gains_foreign_numbers(src, "Improved onboarding 40% for GCC accounts") is True
    # …but a user-supplied metric makes the figure legitimate.
    assert cv_rewrite.gains_foreign_numbers(
        src, "Improved onboarding 40% for GCC accounts", allowed_text="40%") is False


def test_finalize_rejects_foreign_numbers(monkeypatch):
    out = cv_rewrite.finalize_rewrite(
        "Improved onboarding 40% for GCC accounts", None, [],
        source_bullet="Improved client onboarding for GCC accounts",
    )
    assert out["mode"] == "error"
    assert "never stated" in out["rationale"]


# ── markup can never ship (the "SCOPE … || why" leak, 2026-07-16) ────────────

def test_finalize_rejects_unresolved_rewrite_placeholder():
    out = cv_rewrite.finalize_rewrite(
        "<rewrite>",
        None,
        [],
        source_bullet="Cut churn 18% by shipping a lifecycle retention flow",
    )
    assert out == {"mode": "error", "rationale": "No rewrite produced."}


def test_variants_reject_unresolved_template_placeholders(monkeypatch):
    raw = (
        "[METRIC] <rewrite> || <reason>\n"
        "[IMPACT] <rewrite> || <reason>\n"
        "[SCOPE] <rewrite> || <reason>"
    )
    _patch_grounding(monkeypatch, _grounding())
    out = asyncio.run(cv_rewrite.suggest_rewrite_variants(
        "Owned the lifecycle retention flow",
        None,
        [],
        None,
        provider=_FakeProvider(text=raw),
        allow_no_metric=True,
    ))
    assert out == {"mode": "error", "rationale": "No rewrite produced."}


def test_parse_accepts_bracketless_tags_and_strips_why():
    raw = "SCOPE Led platform transformation to Azure, cutting spend ~30% || Highlights system scope"
    out = cv_rewrite._parse_variants(raw)
    assert len(out) == 1
    assert out[0]["angle"] == "scope"
    assert out[0]["text"] == "Led platform transformation to Azure, cutting spend ~30%"
    assert out[0]["why"] == "Highlights system scope"


def test_extract_bullet_strips_tag_and_reason_tail():
    leak = "[SCOPE] Led platform transformation to Azure, cutting spend ~30% || Highlights system scope"
    assert cv_rewrite._extract_bullet(leak) == "Led platform transformation to Azure, cutting spend ~30%"
    bare = "SCOPE: Led platform transformation to Azure, cutting spend ~30%"
    assert cv_rewrite._extract_bullet(bare) == "Led platform transformation to Azure, cutting spend ~30%"


def test_variants_dropping_named_specifics_are_filtered(monkeypatch):
    raw = (
        "[METRIC] Delivered €500K+ revenue in a year by shaping India Cloud B2B GTM strategy for GCC clients — "
        "aligning India insights with global MNCs and pitching cross-BU wins across Life Sciences, Energy, and Aerospace. || leads with the result\n"
        "[IMPACT] Generated €500K+ revenue by shaping India Cloud B2B GTM strategy || the business win"
    )
    _patch_grounding(monkeypatch, _grounding())
    out = asyncio.run(cv_rewrite.suggest_rewrite_variants(
        _CAPGEMINI, None, [], None, provider=_FakeProvider(text=raw)))
    assert out["mode"] == "variants"
    assert [v["angle"] for v in out["variants"]] == ["metric"]   # substance-dropper filtered


# ── weave intent (Surface-skill fixes) ───────────────────────────────────────

def test_weave_returns_one_minimal_suggestion(monkeypatch):
    woven = (
        "Led Platform Transformation & reduced platform maintenance spend by ~30% "
        "through shifting from legacy to Microsoft Azure infrastructure. Reduced "
        "client costs by ~20% via expense-tracking KPIs on property dashboards"
    )
    _patch_grounding(monkeypatch, _grounding())
    out = asyncio.run(cv_rewrite.suggest_rewrite_variants(
        _AZURE, None, ["Microsoft Azure"], None,
        provider=_FakeProvider(text=woven), intent="weave"))
    assert out["mode"] == "variants"
    assert len(out["variants"]) == 1
    assert out["variants"][0]["angle"] == "weave"
    assert "Microsoft Azure" in out["variants"][0]["text"]
    assert "Microsoft Azure" in out["variants"][0]["why"]


def test_weave_skips_the_metric_question(monkeypatch):
    # Surfacing a term needs no number — a metric-less bullet must not be asked.
    _patch_grounding(monkeypatch, _grounding())
    out = asyncio.run(cv_rewrite.suggest_rewrite_variants(
        "Managed cloud infrastructure migration for enterprise clients", None,
        ["Microsoft Azure"], None,
        provider=_FakeProvider(text="Managed Microsoft Azure cloud infrastructure migration for enterprise clients"),
        intent="weave"))
    assert out["mode"] == "variants"


def test_weave_that_loses_substance_keeps_the_original(monkeypatch):
    _patch_grounding(monkeypatch, _grounding())
    out = asyncio.run(cv_rewrite.suggest_rewrite_variants(
        _AZURE, None, ["Microsoft Azure"], None,
        provider=_FakeProvider(text="Migrated to Microsoft Azure"), intent="weave"))
    assert out["mode"] == "error"
    assert "kept your original" in out["rationale"]


# ── no-DELETION guard + salvage ──────────────────────────────────────────────

def test_loses_metrics_normalizes_forms():
    assert cv_rewrite.loses_metrics("Tracked 30,000 jobs", "Tracked jobs at scale") is True
    assert cv_rewrite.loses_metrics("Tracked 30,000 jobs", "Tracked 30k jobs across India") is False
    assert cv_rewrite.loses_metrics("Improved onboarding", "Improved onboarding flows") is False
    assert cv_rewrite.loses_metrics("Saved ₹2 crore", "Saved ₹2 crore annually") is False


def test_single_rewrite_dropping_numbers_errors(monkeypatch):
    provider = _FakeProvider(text="Generated numerous outbound pitches for clients")
    _patch_grounding(monkeypatch, _grounding())
    out = asyncio.run(cv_rewrite.suggest_rewrite("Generated over 50 outbound pitches", None, [], None, provider=provider))
    assert out["mode"] == "error"
    assert "kept your original" in out["rationale"]


def test_finalize_salvages_bullet_from_leaked_reasoning():
    leak = (
        "We need to rewrite one bullet, max ~30 words, start with a strong verb. "
        "The bullet mentions shaping B2B GTM strategy. Let's craft: "
        "'Generated €500K+ revenue by leading Product Marketing-focused B2B GTM strategy'"
    )
    out = cv_rewrite.finalize_rewrite(leak, None, [])
    assert out["mode"] == "rewrite"
    assert out["rewritten_text"].startswith("Generated €500K+ revenue")
    assert "we need to" not in out["rewritten_text"].lower()


def test_finalize_passes_clean_bullet_through():
    out = cv_rewrite.finalize_rewrite("Generated €500K+ revenue by leading B2B GTM strategy", None, [])
    assert out["mode"] == "rewrite"
    assert out["rewritten_text"] == "Generated €500K+ revenue by leading B2B GTM strategy"


# ── named-fix intents (2026-08-25) ────────────────────────────────────────────
# The rail promises a specific change ("Cut “leverage”"). Before this, the kind
# and the offending phrase were never sent, so the server ran an open-ended
# "make it stronger" — and a Cut row was observed returning the original line
# with the buzzword still in it. The instruction now names the change.

def test_cut_intent_names_the_phrase_to_remove(monkeypatch):
    _patch_grounding(monkeypatch, _grounding())
    provider = _FakeProvider()
    asyncio.run(cv_rewrite.suggest_rewrite_variants(
        "Cut churn 18% by leveraging a best-in-class retention flow",
        None, [], None, provider=provider,
        intent="cut", target_phrases=["best-in-class"]))
    sent = provider.last_messages[-1]["content"]
    assert "best-in-class" in sent
    assert "MUST NOT appear" in sent


def test_verb_intent_demands_the_opener_leaves_the_front(monkeypatch):
    _patch_grounding(monkeypatch, _grounding())
    provider = _FakeProvider()
    asyncio.run(cv_rewrite.suggest_rewrite_variants(
        "Cut churn 18% after being responsible for the retention squad",
        None, [], None, provider=provider,
        intent="verb", target_phrases=["Responsible for"]))
    sent = provider.last_messages[-1]["content"]
    assert "Responsible for" in sent
    assert "START with a strong past-tense" in sent


def test_dedupe_intent_names_the_repeated_phrase(monkeypatch):
    _patch_grounding(monkeypatch, _grounding())
    provider = _FakeProvider()
    asyncio.run(cv_rewrite.suggest_rewrite_variants(
        "Cut churn 18% by shaping GTM strategy for GCC clients",
        None, [], None, provider=provider,
        intent="dedupe", target_phrases=["GTM strategy for"]))
    sent = provider.last_messages[-1]["content"]
    assert "GTM strategy for" in sent
    assert "more than one bullet" in sent


def test_an_unnamed_fix_still_gets_the_plain_three_angle_reframe(monkeypatch):
    """No intent = no extra instruction. The open-ended path is unchanged."""
    _patch_grounding(monkeypatch, _grounding())
    provider = _FakeProvider()
    asyncio.run(cv_rewrite.suggest_rewrite_variants(
        "Cut churn 18% by shipping a lifecycle flow", None, [], None, provider=provider))
    sent = provider.last_messages[-1]["content"]
    assert "MUST NOT appear" not in sent
