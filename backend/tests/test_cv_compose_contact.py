from app.services.cv_compose import render_deterministic


def test_render_deterministic_preserves_cv_contact_block() -> None:
    rendered = render_deterministic({
        "contact": {
            "name": "Ada Lovelace",
            "title": "Engineer",
            "email": "ada@example.com",
            "phone": "+44 20 0000 0000",
            "location": "London",
            "linkedin": "linkedin.com/in/ada",
        },
        "summary": "Builds reliable systems.",
        "experience": [],
        "projects": [],
        "education": [],
        "skills_line": None,
        "certs": [],
    })

    assert rendered.startswith("Ada Lovelace\nEngineer\nLondon · ada@example.com · +44 20 0000 0000")


def test_render_deterministic_follows_section_order() -> None:
    rendered = render_deterministic(
        {
            "summary": "I ship.",
            "experience": [],
            "projects": [],
            "education": [{
                "institution": "X", "degree": "B", "dates": "2020",
                "grade": "", "location": "",
            }],
            "skills_line": "Python",
            "certs": [],
        },
        section_order=["education", "skills_line", "summary", "experience", "projects", "certs"],
    )
    assert rendered.index("EDUCATION") < rendered.index("SKILLS")
    assert rendered.index("SKILLS") < rendered.index("SUMMARY")
