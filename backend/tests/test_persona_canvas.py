"""Lane B persona canvas — pure-core guards.

The trust properties that must never regress:
- number honesty: a digit the signals don't contain drops the paragraph
  (ADR-0016 — never ship an invented number on a trust surface);
- grounds resolve to real signal lines (unknown ids silently dropped);
- USER EDITS ARE LAW: pinned paragraphs survive regeneration at their
  position and count against the per-movement cap;
- junk LLM output → None (caller keeps the previous canvas).
"""
from __future__ import annotations

from app.services import persona_signals as ps
from app.services import persona_synthesis as syn

LINES = [
    {"id": "S1", "text": "14 jobs saved on Myro — examples: Strategy Manager @ Razorpay"},
    {"id": "S2", "text": "11 job cards dismissed without a second look — examples: Delivery Lead @ TCS"},
    {"id": "S3", "text": "3 CVs tailored for specific jobs — for: Partner Manager @ Google"},
]


# ── persona_signals pure helpers ─────────────────────────────────────────────

def test_numbers_in_normalizes_thousands_and_decimals() -> None:
    assert ps.numbers_in("raised ₹2,377 and 72% on 3.5 rating") == {"2377", "72", "3.5"}


def test_allowed_numbers_unions_lines_and_extras() -> None:
    allowed = ps.allowed_numbers(LINES, ["I shipped 40 posts"])
    assert {"14", "11", "3", "40"} <= allowed


def test_render_block_prefixes_ids() -> None:
    block = ps.render_block(LINES)
    assert block.splitlines()[0].startswith("S1: 14 jobs saved")


# ── parse_canvas ─────────────────────────────────────────────────────────────

def test_parse_canvas_reads_fenced_json() -> None:
    raw = '```json\n{"past":[{"text":"You built things.","grounds":["S1"]}],"present":[],"future":[]}\n```'
    canvas = syn.parse_canvas(raw)
    assert canvas is not None
    assert canvas["past"][0]["text"] == "You built things."
    assert canvas["past"][0]["grounds"] == ["S1"]


def test_parse_canvas_junk_returns_none() -> None:
    assert syn.parse_canvas("Sorry, I cannot help with that.") is None
    assert syn.parse_canvas("") is None
    assert syn.parse_canvas('{"past": [], "present": [], "future": []}') is None  # all-empty


# ── sanitize: number honesty + ground resolution ─────────────────────────────

def test_sanitize_drops_fabricated_numbers() -> None:
    canvas = {
        "past": [{"text": "You saved 14 jobs.", "grounds": ["S1"]}],
        "present": [{"text": "You dismissed 99 delivery roles.", "grounds": ["S2"]}],  # 99 invented
        "future": [],
    }
    out = syn.sanitize(canvas, LINES, ps.allowed_numbers(LINES))
    assert [p["movement"] for p in out] == ["past"]
    assert out[0]["grounds"] == [LINES[0]["text"]]  # id resolved to display line


def test_sanitize_skips_unknown_ground_ids() -> None:
    canvas = {"past": [{"text": "No numbers here.", "grounds": ["S1", "S9"]}], "present": [], "future": []}
    out = syn.sanitize(canvas, LINES, ps.allowed_numbers(LINES))
    assert out[0]["grounds"] == [LINES[0]["text"]]


def test_sanitize_allows_numbers_from_pinned_extras() -> None:
    canvas = {"future": [{"text": "Your 15,000 watch hours matter.", "grounds": []}], "past": [], "present": []}
    allowed = ps.allowed_numbers(LINES, ["My channel crossed 15,000 watch hours"])
    out = syn.sanitize(canvas, LINES, allowed)
    assert len(out) == 1


# ── merge_pinned: user edits are law ─────────────────────────────────────────

def _para(movement: str, text: str, *, pinned: bool = False) -> dict:
    return {"id": text, "movement": movement, "text": text, "author": "user" if pinned else "myro",
            "pinned": pinned, "grounds": []}


def test_merge_pinned_keeps_pinned_at_position() -> None:
    old = [_para("past", "myro-old-a"), _para("past", "USER LAW", pinned=True)]
    new = [_para("past", "myro-new-a"), _para("past", "myro-new-b")]
    merged = syn.merge_pinned(new, old)
    texts = [p["text"] for p in merged]
    assert "USER LAW" in texts
    assert texts.index("USER LAW") == 1  # original index within its movement


def test_merge_pinned_cap_never_evicts_pinned() -> None:
    old = [_para("present", f"pin{i}", pinned=True) for i in range(4)]
    new = [_para("present", f"new{i}") for i in range(4)]
    merged = syn.merge_pinned(new, old)
    kept = [p["text"] for p in merged if p["movement"] == "present"]
    assert all(f"pin{i}" in kept for i in range(4))
    assert len(kept) == syn._MAX_PER_MOVEMENT


def test_merge_pinned_unpinned_old_prose_is_replaced() -> None:
    old = [_para("future", "stale myro prose")]
    new = [_para("future", "fresh myro prose")]
    merged = syn.merge_pinned(new, old)
    assert [p["text"] for p in merged] == ["fresh myro prose"]


# ── build_messages ───────────────────────────────────────────────────────────

def test_build_messages_carries_signals_facts_and_pinned() -> None:
    msgs = syn.build_messages(ps.render_block(LINES), ["preference: prefers international work"],
                              [{"movement": "past", "text": "I make things to understand them."}])
    user = msgs[1]["content"]
    assert "S2: 11 job cards dismissed" in user
    assert "prefers international work" in user
    assert "[past] I make things to understand them." in user
    assert "PINNED" in user


# ── PATCH /memory/persona/paragraphs/{id} — edits become law ─────────────────

class _FakePersonaDb:
    """Chainable stub for table('user_persona').update(...).eq(...).execute()."""

    def __init__(self) -> None:
        self.updated: dict | None = None

    def table(self, name: str) -> "_FakePersonaDb":
        return self

    def update(self, payload: dict) -> "_FakePersonaDb":
        self.updated = payload
        return self

    def eq(self, *args: object) -> "_FakePersonaDb":
        return self

    def execute(self) -> object:
        return type("R", (), {"data": []})()


def _persona_client(monkeypatch, paragraphs: list[dict]) -> tuple:
    from fastapi.testclient import TestClient

    from app.deps import CurrentUser, get_current_user, get_user_db
    from app.main import app

    fake_db = _FakePersonaDb()
    monkeypatch.setattr(syn, "read_persona", lambda db, uid: {"paragraphs": paragraphs})
    app.dependency_overrides[get_user_db] = lambda: fake_db
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email="u@x.com", token="t")
    return TestClient(app), fake_db, app


def test_edit_paragraph_pins_and_marks_user(monkeypatch) -> None:
    client, fake_db, app = _persona_client(
        monkeypatch,
        [{"id": "p1", "movement": "past", "text": "old", "author": "myro", "pinned": False,
          "grounds": ["14 jobs saved"]}],
    )
    try:
        res = client.patch("/memory/persona/paragraphs/p1", json={"text": "My words."})
        assert res.status_code == 200
        body = res.json()
        assert body["author"] == "user" and body["pinned"] is True and body["text"] == "My words."
        assert body["grounds"] == []
        assert fake_db.updated is not None and fake_db.updated["paragraphs"][0]["pinned"] is True
    finally:
        app.dependency_overrides.clear()


def test_edit_paragraph_unknown_id_404(monkeypatch) -> None:
    client, _, app = _persona_client(monkeypatch, [])
    try:
        assert client.patch("/memory/persona/paragraphs/nope", json={"text": "x"}).status_code == 404
        assert client.patch("/memory/persona/paragraphs/nope", json={}).status_code == 400
    finally:
        app.dependency_overrides.clear()
