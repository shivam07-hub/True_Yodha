"""JD Reflection — entailment is a phrase the line actually carries.

The pairs are the PwC DTDS paper (738091WD): a sales pipeline is not a data
pipeline, a dashboard is not Alteryx, and Tableau on the skills line is.
"""

from app.services.jd_reflection import Evidence, entails, format_block, pointer_inside_source, reflect


SALES = Evidence(
    id="sales",
    text=(
        "Generated 50+ inbound requirements in 10 months through account "
        "penetration, white-space identification, and value-led showcases, "
        "and built a qualified pipeline across Data & AI service lines."
    ),
)
JLL = Evidence(
    id="jll",
    text=(
        "SPOC for 50+ enterprise clients (US & EMEA) on data and analytics, "
        "and engineered property-tech dashboards for capital allocation."
    ),
)
AZURE = Evidence(
    id="azure",
    text=(
        "Reduced platform maintenance spend by ~30% of the IT budget through "
        "Azure data-pipeline optimization."
    ),
)
SKILLS = Evidence(
    id="skills",
    text="Python, SQL, Snowflake, Google Analytics, Tableau, Excel, PowerPoint, PyCharm",
)
AB = Evidence(
    id="ab",
    text=(
        "Ran A/B tests and built funnel analytics (acquisition → activation → "
        "retention) to validate feature impact on retention and monetisation."
    ),
)
CLOUD = Evidence(
    id="cloud",
    text=(
        "Pitched cloud with Azure as the majority, alongside GCP and AWS, "
        "on RFPs and RFIs."
    ),
)

EVIDENCE = [SALES, JLL, AZURE, SKILLS, AB, CLOUD]


def _status(requirement: str) -> tuple[str, str | None]:
    motion = reflect([requirement], EVIDENCE)[0]
    return motion.status, motion.evidence_id


def test_sales_pipeline_does_not_prove_a_data_pipeline():
    status, evidence_id = _status(
        "Oversee creation of data pipelines and warehouses"
    )
    assert status == "proven"
    assert evidence_id == "azure"


def test_dashboards_do_not_prove_a_named_tool_list():
    status, evidence_id = _status(
        "Develop data-driven strategies using tools such as Alteryx, Power BI, and Tableau"
    )
    assert (status, evidence_id) == ("proven", "skills")


def test_ab_tests_do_not_prove_predictive_modeling():
    status, evidence_id = _status(
        "Conduct exploratory data analysis and predictive modeling"
    )
    assert (status, evidence_id) == ("gap", None)


def test_a_dashboard_line_proves_dashboards():
    status, evidence_id = _status(
        "Prepare and present detailed reports and dashboards"
    )
    assert (status, evidence_id) == ("proven", "jll")


def test_naming_azure_does_not_prove_a_certification():
    status, evidence_id = _status(
        "A certification in cloud platforms (AWS, Azure, GCP)"
    )
    assert (status, evidence_id) == ("gap", None)


def test_cloud_line_proves_an_alternative_cloud_list():
    requirement = "Experience with cloud platforms such as AWS, Azure, and GCP"
    # The Azure pipeline bullet names Azure, so it is the first proving line.
    assert _status(requirement) == ("proven", "azure")
    assert entails(requirement, CLOUD.text)


def test_a_paraphrase_is_not_inside_the_answer():
    source = "I own the India territory for 2 years across 12 cities."
    assert pointer_inside_source(source, source)
    assert not pointer_inside_source(source, "Engineered a robust inbound pipeline across the region.")
    assert not pointer_inside_source(source, "Ran proposals")


def test_format_block_names_the_line_and_leaves_the_gap():
    block = format_block(
        ["tools such as Alteryx, Power BI, and Tableau", "A certification in cloud platforms (AWS, Azure, GCP)"],
        ["Python, SQL, Tableau"],
    )
    assert "Tableau" in block
    assert "Motions still unproven" in block
    assert "certification" in block


def test_order_is_the_requirement_order_and_a_blank_motion_is_a_gap():
    motions = reflect(["", "Oversee creation of data pipelines and warehouses"], EVIDENCE)
    assert [(m.requirement, m.status) for m in motions] == [
        ("", "gap"),
        ("Oversee creation of data pipelines and warehouses", "proven"),
    ]
