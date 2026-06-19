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
