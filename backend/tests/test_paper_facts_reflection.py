"""Match Eval reads the coverage panel's verdicts as facts; it does not judge."""

from app.services import jd_coverage
from app.services.jd_coverage import CoverageItem, CoverageResult
from app.services.matching import paper_facts


def _panel() -> str:
    return jd_coverage.result_to_payload(CoverageResult(requirements=[
        CoverageItem(requirement="Build dashboards", status="covered", source="cv",
                     story_pointer="Built dashboards for 50+ clients",
                     proof_lines=["Built dashboards for 50+ clients"]),
        CoverageItem(requirement="Own quota", status="weak", story_id="s1",
                     story_pointer="Owned the India quota"),
        CoverageItem(requirement="Write production SQL", status="gap"),
    ]))


def test_the_block_is_the_panel_verdicts():
    block = paper_facts.reflection_text(_panel())
    assert "- Build dashboards — Built dashboards for 50+ clients" in block
    assert "- Own quota — Owned the India quota" in block
    assert "Motions still unproven:\n- Write production SQL" in block


def test_proof_sets_follow_the_requirement_order():
    assert paper_facts.proof_sets(_panel()) == [["Built dashboards for 50+ clients"], [], []]
    assert paper_facts.proof_sets(None) == []
    assert paper_facts.reflection_text("not json") == ""
