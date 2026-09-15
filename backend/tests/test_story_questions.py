"""The standing completion queue (#13 L3) — what it asks, and what it stops asking.

Every case here is built from the shape the live reservoir actually produces.
The one that matters most: every story the upload bridge has minted on prod so
far fills three STAR fields — `told` by story_depth — and carries no metric at
all. Depth and wholeness are two axes, and a queue driven by depth alone would
have had nothing to say about any of them.
"""
from __future__ import annotations

from app.services import story_depth, story_questions


def story(**over):
    base = {
        "id": "s1",
        "title": "Patient data analysis",
        "status": "active",
        "created_at": "2026-09-13T00:00:00Z",
        "narrative": {"situation": "s", "task": "t", "action": "a"},
        "metrics": [],
    }
    base.update(over)
    return base


WHOLE = (
    "Cut invoice processing time by 43% across 12 markets by rebuilding the "
    "reconciliation pipeline from ingest through to the ledger"
)
NO_NUMBER = (
    "Analyzed patient data using SQL, Excel, and Power BI to inform development "
    "of a physiotherapy device, translating findings into actionable insights"
)
SHORT = "Managed procurement, logistics and budget coordination for SAE projects"


def test_a_whole_told_bullet_asks_nothing():
    kinds, missing = story_questions.ask_for(story(metrics=[{"value": "43%"}]), WHOLE)
    assert kinds == ()
    assert missing == []
    assert story_questions.question_for(story(metrics=[{"value": "43%"}]), WHOLE) is None


def test_a_told_story_with_no_number_is_still_asked():
    """The live case: three STAR fields, zero metrics, no digit in the bullet."""
    kinds, missing = story_questions.ask_for(story(), NO_NUMBER)
    assert kinds == (story_questions.NUMBER,)
    assert missing == ["no number in this line"]


def test_a_recorded_metric_answers_the_number_without_a_digit_in_the_line():
    kinds, _ = story_questions.ask_for(story(metrics=[{"value": "12 markets"}]), NO_NUMBER)
    assert kinds == ()


def test_a_complete_bullet_one_word_under_the_band_is_not_a_question():
    """Regression, found against the live reservoir before this shipped.

    `story_depth.missing_from_pointer` calls a sub-18-word line short of "what
    you actually did to get there". This real bullet is 17 words and says what it
    did outright. A standing queue that asks about good bullets teaches the user
    to ignore it, so length never becomes a question here.
    """
    line = (
        "Halted manual release effort by 50% by implementing Jenkins CI/CD "
        "pipelines for build, test, and deployment automation"
    )
    assert len(line.split()) == 17
    told = story(narrative={"situation": "s", "task": "t", "action": "a", "result": "r"})
    assert story_depth.missing_from_pointer(line, []) != []      # the advisory still says so
    assert story_questions.ask_for(told, line) == ((), [])       # the queue does not ask


def test_a_thin_narrative_is_asked_even_when_the_bullet_reads_well():
    thin = story(narrative={"result": "r"}, metrics=[{"value": "43%"}])
    kinds, missing = story_questions.ask_for(thin, WHOLE)
    assert kinds == (story_questions.SUBSTANCE,)
    assert missing[-1] == "never told in full"


def test_both_gaps_get_one_question_not_two():
    kinds, _ = story_questions.ask_for(story(narrative={"result": "r"}), SHORT)
    assert kinds == (story_questions.NUMBER, story_questions.SUBSTANCE)
    assert story_questions.prompt_for(kinds) == "What did you actually do — and how big was it?"


def test_a_long_bullet_is_an_edit_not_a_question():
    """Tightening is something Myro can do alone, so it never enters the queue."""
    long_line = " ".join(["Delivered"] + ["a measurable 40% improvement"] * 8)
    kinds, _ = story_questions.ask_for(story(metrics=[{"value": "40%"}]), long_line)
    assert kinds == ()


def test_the_queue_counts_and_orders_by_how_much_is_missing():
    stories = [
        story(id="whole", metrics=[{"value": "43%"}], created_at="2026-09-01T00:00:00Z"),
        story(id="number", created_at="2026-09-02T00:00:00Z"),
        story(id="both", narrative={"result": "r"}, created_at="2026-09-03T00:00:00Z"),
    ]
    pointers = {"whole": WHOLE, "number": NO_NUMBER, "both": SHORT}
    out = story_questions.build_queue(stories, pointers)
    assert [q["story_id"] for q in out["questions"]] == ["both", "number"]
    assert out["questions_total"] == 2
    assert out["missing_number"] == 2
    assert out["questions_set_aside"] == 0


def test_newest_first_within_the_same_amount_missing():
    stories = [
        story(id="old", created_at="2026-01-01T00:00:00Z"),
        story(id="new", created_at="2026-09-13T00:00:00Z"),
    ]
    out = story_questions.build_queue(stories, {"old": NO_NUMBER, "new": NO_NUMBER})
    assert [q["story_id"] for q in out["questions"]] == ["new", "old"]


def test_a_set_aside_bullet_leaves_the_queue_but_is_still_counted():
    stories = [story(id="s1", completion_declined_at="2026-09-14T00:00:00Z")]
    out = story_questions.build_queue(stories, {"s1": NO_NUMBER})
    assert out["questions"] == []
    assert out["questions_total"] == 0
    assert out["questions_set_aside"] == 1


def test_a_question_whose_answer_is_still_being_read_is_not_asked_again():
    """Never asked twice has to survive a page reload — hence the ledger."""
    stories = [story(id="s1")]
    out = story_questions.build_queue(stories, {"s1": NO_NUMBER}, awaiting={"s1"})
    assert out["questions"] == []
    assert out["questions_total"] == 0
    assert out["questions_set_aside"] == 0


def test_archived_stories_are_never_asked_about():
    stories = [story(id="s1", status="archived")]
    assert story_questions.build_queue(stories, {"s1": NO_NUMBER})["questions"] == []


def test_the_queue_pages_but_the_total_stays_honest():
    stories = [story(id=f"s{i}", created_at=f"2026-09-{i:02d}T00:00:00Z") for i in range(1, 10)]
    pointers = {s["id"]: NO_NUMBER for s in stories}
    out = story_questions.build_queue(stories, pointers, page=3)
    assert len(out["questions"]) == 3
    assert out["questions_total"] == 9


def test_a_story_with_no_pointer_asks_nothing():
    """Nothing to put in front of the user, and what it needs is a projection —
    not a fact only they hold. Five such stories exist on prod."""
    assert story_questions.ask_for(story(), "") == ((), [])
    assert story_questions.question_for(story(), "") is None


def test_the_role_label_travels_with_the_question():
    out = story_questions.build_queue(
        [story(id="s1")], {"s1": NO_NUMBER}, {"s1": "Analyst · Medtronic"},
    )
    assert out["questions"][0]["role_label"] == "Analyst · Medtronic"


def test_the_two_ask_counts_overlap_and_are_both_reported():
    """Regression, caught rendering the real reservoir.

    One bullet can be missing its number AND never have been told. The surface
    used to derive stories-to-tell as `total - missing_number`, which reported
    zero for exactly this queue — the ask was on screen and the rail said there
    was nothing to tell.
    """
    both = story(id="both", narrative={"result": "r"})
    out = story_questions.build_queue([both], {"both": NO_NUMBER})
    assert out["questions_total"] == 1
    assert out["missing_number"] == 1
    assert out["missing_story"] == 1
    assert out["missing_number"] + out["missing_story"] != out["questions_total"]
