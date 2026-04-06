"""
cv_parser.py
STUB — returns synthetic skill signals for testing.

Replace with intern's implementation when delivered.
Contract: parse_cv(file_bytes, file_type) → dict
  {
    "skills_detected": [
      {"taxonomy_key": str, "xp_awarded": int, "signal_type": str, "evidence": str}
    ],
    "raw_text": str
  }

Signal types and XP:
  "mention"    → +50   (skill named in skills section only)
  "project"    → +150  (skill used in a project context)
  "impact"     → +350  (skill applied with measurable scale/metrics)
  "leadership" → +500  (led design or architecture using this skill)

Tests the intern's code must pass: backend/tests/test_cv_parser.py
"""


async def parse_cv(file_bytes: bytes, file_type: str) -> dict:
    """
    Parse a CV and return detected skill signals.

    Args:
        file_bytes: Raw bytes of the uploaded PDF or DOCX
        file_type: "pdf" or "docx"

    Returns:
        {"skills_detected": [...], "raw_text": str}
    """
    # STUB — replace with real implementation
    return {
        "skills_detected": [
            {
                "taxonomy_key": "sql",
                "xp_awarded": 350,
                "signal_type": "impact",
                "evidence": "Optimised SQL queries reducing report generation time by 60%",
            },
            {
                "taxonomy_key": "python",
                "xp_awarded": 150,
                "signal_type": "project",
                "evidence": "Built ETL pipeline in Python to process 2M records daily",
            },
            {
                "taxonomy_key": "data_visualisation",
                "xp_awarded": 150,
                "signal_type": "project",
                "evidence": "Created Tableau dashboards for C-suite reporting",
            },
            {
                "taxonomy_key": "statistical_analysis",
                "xp_awarded": 50,
                "signal_type": "mention",
                "evidence": "Statistical analysis",
            },
            {
                "taxonomy_key": "stakeholder_management",
                "xp_awarded": 350,
                "signal_type": "impact",
                "evidence": "Presented insights to 15+ stakeholders across 3 business units",
            },
        ],
        "raw_text": "Stub CV text — replace with real parsed content",
    }
