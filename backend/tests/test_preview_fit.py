"""The extension preview's fit is the job's provisional match_score.

One overlap formula (`job_matcher.overlap`) over the rows a save would write
(`job_importer.preview_rows` → `skill_floor.floor_rows`). The preview used to
run its own primary×2/secondary×1 copy, so the popup, /intel and the job card
could show three different numbers for one job.
"""
from types import SimpleNamespace

from app.services import job_matcher, skill_floor
from app.services.jobs_workflow import preview_fit as _preview_fit
from app.services.skill_extraction import ExtractedSkill

SKILLS = {
    "Python (Programming Language)": {"id": 1, "practice_mode": None, "skill_kind": "hard"},
    "SQL (Programming Language)": {"id": 2, "practice_mode": None, "skill_kind": "hard"},
    "Docker (Software)": {"id": 3, "practice_mode": None, "skill_kind": "hard"},
    "Communication": {"id": 4, "practice_mode": "observed", "skill_kind": "soft"},
}


class _SkillsDb:
    """`db.table("skills").select(...).in_("taxonomy_key", keys).execute()`."""

    def table(self, name):
        assert name == "skills"
        return self

    def select(self, _cols):
        return self

    def in_(self, _col, keys):
        self._keys = keys
        return self

    def execute(self):
        return SimpleNamespace(data=[{"taxonomy_key": k, **SKILLS[k]} for k in self._keys if k in SKILLS])


class _Repo:
    client = _SkillsDb()

    def __init__(self, user_skills):
        self.user_skills = user_skills

    def get_user_skill_map(self, _uid):
        return self.user_skills


def _preview(primary, secondary=()):
    shape = lambda k: {"label": k, "taxonomy_key": k}  # noqa: E731
    return {
        "role_name": "Data Engineer",
        "job_description": "x",
        "primary_skills": [shape(k) for k in primary],
        "secondary_skills": [shape(k) for k in secondary],
    }


def test_floor_rows_are_the_rows_a_save_writes():
    rows = skill_floor.floor_rows(_SkillsDb(), [
        ExtractedSkill("Python (Programming Language)", "preferred", 2, 0.9),
        ExtractedSkill("Python (Programming Language)", "must_have", 4, 0.9),  # strongest wins
        ExtractedSkill("Not In Taxonomy", "must_have", 4, 0.9),                # FK would reject
    ])
    assert rows == [{
        "is_primary": True,
        "required_level": 4,
        "skills": {"taxonomy_key": "Python (Programming Language)", "practice_mode": None, "skill_kind": "hard"},
    }]


def test_preview_fit_is_the_matchers_overlap_on_those_rows():
    preview = _preview(["Python (Programming Language)", "SQL (Programming Language)"], ["Docker (Software)"])
    user = {"Python (Programming Language)": 4, "Docker (Software)": 2}
    fit = _preview_fit(_Repo(user), "u1", preview)

    rows = skill_floor.floor_rows(_SkillsDb(), [
        ExtractedSkill("Python (Programming Language)", "must_have", 4, 0.9),
        ExtractedSkill("SQL (Programming Language)", "must_have", 4, 0.9),
        ExtractedSkill("Docker (Software)", "preferred", 2, 0.9),
    ])
    score, matched, missing = job_matcher.overlap(rows, {k.lower(): v for k, v in user.items()})
    assert fit["match_score"] == round(score) == 60  # (4 + 2) / (4 + 4 + 2)
    assert set(fit["matched_skills"]) == set(matched)
    assert fit["top_gaps"] == missing[:2] == ["SQL (Programming Language)"]


def test_a_skill_the_matcher_does_not_level_does_not_move_the_number():
    """The old copy counted every chip; the matcher drops non-levelled skills."""
    with_soft = _preview_fit(_Repo({}), "u1", _preview(["Python (Programming Language)"], ["Communication"]))
    without = _preview_fit(_Repo({}), "u1", _preview(["Python (Programming Language)"]))
    assert with_soft == without


def test_gaps_come_deepest_first_and_cap_at_two():
    preview = _preview(["SQL (Programming Language)"], ["Docker (Software)", "Python (Programming Language)"])
    fit = _preview_fit(_Repo({}), "u1", preview)
    assert fit["match_score"] == 0
    assert fit["top_gaps"][0] == "SQL (Programming Language)"
    assert len(fit["top_gaps"]) == 2


def test_no_resolvable_skill_is_unknown_fit_not_zero(monkeypatch):
    # An empty confirmation falls back to reading the text, as the save does.
    monkeypatch.setattr("app.services.job_importer.extract_skills", lambda role, jd: [])
    fit = _preview_fit(_Repo({"Python (Programming Language)": 3}), "u1", _preview([]))
    assert fit == {"match_score": None, "matched_skills": [], "top_gaps": []}
