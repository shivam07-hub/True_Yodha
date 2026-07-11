"""story_extractor — pure parse/validate + LinkedIn CSV rendering."""
import json

from app.services import story_extractor


def _valid_payload() -> dict:
    return {
        "roles": [
            {"company": "Capgemini", "title": "Sales Manager", "location": "Hyderabad",
             "date_label": "May 2025 – Present", "kind": "work"},
            {"company": "IIM Lucknow", "title": "MBA", "kind": "education"},
        ],
        "stories": [
            {
                "role_index": 0,
                "kind": "project",
                "title": "T&M expansion pipeline",
                "narrative": {"situation": "New GCC lane.", "task": "Grow headcount.",
                              "action": "Account mapping.", "result": "50+ requirements."},
                "metrics": [{"value": "50+", "what": "inbound T&M requirements"}],
                "skills": ["Account Management", "GTM Strategy"],
                "pointer": "Generated 50+ inbound T&M requirements in 10 months through targeted account mapping.",
            },
            {
                "role_index": 99,  # out of range → role-less, kept
                "kind": "accolade",
                "title": "CAT 99.65%ile",
                "narrative": {},
                "metrics": [{"value": "99.65%ile", "what": "CAT 2021"}],
                "skills": [],
                "pointer": "Scored 99.65 percentile in CAT 2021.",
            },
        ],
    }


def test_parse_extraction_valid():
    out = story_extractor.parse_extraction(json.dumps(_valid_payload()))
    assert len(out["roles"]) == 2
    assert out["roles"][1]["kind"] == "education"
    assert len(out["stories"]) == 2
    s0 = out["stories"][0]
    assert s0["role_index"] == 0
    assert s0["metrics"][0]["value"] == "50+"
    assert s0["skills"] == ["Account Management", "GTM Strategy"]
    # out-of-range role_index dropped to None, story kept
    assert out["stories"][1]["role_index"] is None


def test_parse_extraction_code_fenced_and_junk():
    fenced = "```json\n" + json.dumps(_valid_payload()) + "\n```"
    assert len(story_extractor.parse_extraction(fenced)["stories"]) == 2
    assert story_extractor.parse_extraction("no json here") == {"roles": [], "stories": []}
    assert story_extractor.parse_extraction("")["stories"] == []
    assert story_extractor.parse_extraction('{"roles": "nope", "stories": 3}') == {"roles": [], "stories": []}


def test_parse_extraction_coerces_bad_kinds_and_caps():
    payload = {
        "roles": [{"title": "X", "kind": "alien"}],
        "stories": [{
            "role_index": 0, "kind": "alien", "title": "Y",
            "skills": [f"s{i}" for i in range(20)],
            "metrics": [{"value": f"{i}%", "what": "w"} for i in range(20)],
            "pointer": "P",
        }],
    }
    out = story_extractor.parse_extraction(json.dumps(payload))
    assert out["roles"][0]["kind"] == "work"
    story = out["stories"][0]
    assert story["kind"] == "project"
    assert len(story["skills"]) == 8
    assert len(story["metrics"]) == 8


def test_parse_extraction_pointer_title_fallbacks():
    payload = {"roles": [], "stories": [
        {"title": "", "pointer": "Only a pointer given here."},
        {"title": "Only a title", "pointer": ""},
        {"title": "", "pointer": ""},  # dropped
    ]}
    out = story_extractor.parse_extraction(json.dumps(payload))
    assert len(out["stories"]) == 2
    assert out["stories"][0]["title"] == "Only a pointer given here."
    assert out["stories"][1]["pointer"] == "Only a title"


_POSITIONS_CSV = (
    "Company Name,Title,Description,Location,Started On,Finished On\n"
    'Capgemini,Sales Manager,"Drove €500K+ revenue targets.",Hyderabad,May 2025,\n'
    "JLL,Data Engineer,Built dashboards.,Bengaluru,Aug 2020,Jul 2022\n"
).encode()

_CONNECTIONS_CSV = (
    "First Name,Last Name,URL,Email Address,Company,Position,Connected On\n"
    "A,B,url,e,ACME,Boss,01 Jan 2020\n"
).encode()


def test_linkedin_csv_kind_detection():
    assert story_extractor.linkedin_csv_kind(_POSITIONS_CSV) == "positions"
    # Connections.csv is NOT a career-content CSV — must not match any renderer.
    assert story_extractor.linkedin_csv_kind(_CONNECTIONS_CSV) is None
    assert story_extractor.linkedin_csv_kind(b"") is None
    profile = b"First Name,Last Name,Headline,Summary\nS,P,Data & AI,Building himyro\n"
    assert story_extractor.linkedin_csv_kind(profile) == "profile"


def test_render_linkedin_positions():
    text = story_extractor.render_linkedin_csv("positions", _POSITIONS_CSV)
    assert "WORK HISTORY" in text
    assert "ROLE: Sales Manager @ Capgemini" in text
    assert "May 2025 – Present" in text          # open-ended role gets Present
    assert "Aug 2020 – Jul 2022" in text
    assert "Drove €500K+ revenue targets." in text


def test_build_messages_grounds_static_when_no_passages():
    msgs = story_extractor.build_messages("raw career text", passages=None)
    assert msgs[0]["role"] == "system"
    assert "XYZ formula" in msgs[0]["content"]
    assert "raw career text" in msgs[1]["content"]
