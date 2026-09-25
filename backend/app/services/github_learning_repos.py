"""Links to public GitHub repos cited by developer roadmaps.

The rows live in `github_learning_repos`. This module only decides which of
those links belong on a skill path: the skill must already be on the path,
and the URL must be a repository, not roadmap prose.
"""
from __future__ import annotations

from typing import Any

USE_CASES = (
    "role_path",
    "language",
    "framework",
    "data_infrastructure",
    "practice",
    "ai_tooling",
)

_ROLE = {
    "ai-data-scientist",
    "ai-engineer",
    "ai-product-builder",
    "ai-red-teaming",
    "android",
    "backend",
    "backend-beginner",
    "bi-analyst",
    "data-analyst",
    "data-engineer",
    "devops",
    "devops-beginner",
    "devrel",
    "devsecops",
    "engineering-manager",
    "forward-deployed-engineer",
    "frontend",
    "frontend-beginner",
    "full-stack",
    "game-developer",
    "ios",
    "network-engineer",
    "product-manager",
    "qa",
    "server-side-game-developer",
    "software-architect",
    "technical-writer",
    "ux-design",
}
_LANGUAGE = {
    "c",
    "cpp",
    "css",
    "golang",
    "html",
    "java",
    "javascript",
    "kotlin",
    "php",
    "python",
    "python-data-analysis",
    "r",
    "r-programming",
    "ruby",
    "rust",
    "scala",
    "shell-bash",
    "typescript",
}
_FRAMEWORK = {
    "angular",
    "aspnet-core",
    "django",
    "flutter",
    "laravel",
    "nextjs",
    "nodejs",
    "react",
    "react-native",
    "ruby-on-rails",
    "spring-boot",
    "swift-ui",
    "vue",
    "wordpress",
}
_DATA = {
    "aws",
    "cloudflare",
    "docker",
    "elasticsearch",
    "kubernetes",
    "linux",
    "mongodb",
    "postgresql-dba",
    "redis",
    "sql",
    "terraform",
}
_PRACTICE = {
    "api-design",
    "blockchain",
    "code-review",
    "computer-science",
    "cyber-security",
    "datastructures-and-algorithms",
    "design-system",
    "git-github",
    "git-github-beginner",
    "graphql",
    "leetcode",
    "power-bi",
    "product-design",
    "prompt-engineering",
    "seo",
    "software-design-architecture",
    "system-design",
}
_AI = {
    "ai-agents",
    "claude-code",
    "machine-learning",
    "mlops",
    "openclaw",
    "vibe-coding",
}

ROADMAP_USE_CASE: dict[str, str] = {
    **{slug: "role_path" for slug in _ROLE},
    **{slug: "language" for slug in _LANGUAGE},
    **{slug: "framework" for slug in _FRAMEWORK},
    **{slug: "data_infrastructure" for slug in _DATA},
    **{slug: "practice" for slug in _PRACTICE},
    **{slug: "ai_tooling" for slug in _AI},
}

# Exact `skills.taxonomy_key`. Only where the roadmap is that skill.
# Broad roles with no single Lightcast skill stay unlinked.
TAXONOMY_FOR_ROADMAP: dict[str, str] = {
    "ai-agents": "AI Agents",
    "android": "Android Development",
    "angular": "Angular (Web Framework)",
    "api-design": "API Design",
    "aspnet-core": "ASP.NET Core",
    "aws": "Amazon Web Services",
    "blockchain": "Blockchain",
    "c": "C (Programming Language)",
    "cloudflare": "Cloudflare",
    "code-review": "Code Review",
    "computer-science": "Computer Science",
    "cpp": "C++ (Programming Language)",
    "css": "Cascading Style Sheets (CSS)",
    "cyber-security": "Cyber Security",
    "data-analyst": "Data Analysis",
    "data-engineer": "Data Engineering",
    "datastructures-and-algorithms": "Data Structures",
    "devops": "DevOps",
    "devops-beginner": "DevOps",
    "devsecops": "DevSecOps",
    "django": "Django (Web Framework)",
    "docker": "Docker (Software)",
    "elasticsearch": "Elasticsearch",
    "flutter": "Flutter (Software)",
    "frontend": "Frontend Engineering",
    "frontend-beginner": "Frontend Engineering",
    "git-github": "Git (Version Control System)",
    "git-github-beginner": "Git (Version Control System)",
    "golang": "Go (Programming Language)",
    "graphql": "GraphQL",
    "html": "HyperText Markup Language (HTML)",
    "ios": "IOS Development",
    "java": "Java (Programming Language)",
    "javascript": "JavaScript (Programming Language)",
    "kotlin": "Kotlin",
    "kubernetes": "Kubernetes",
    "laravel": "Laravel",
    "linux": "Linux",
    "machine-learning": "Machine Learning",
    "mlops": "MLOps (Machine Learning Operations)",
    "mongodb": "MongoDB",
    "nextjs": "Next.js (Javascript Library)",
    "nodejs": "Node.js (Javascript Library)",
    "php": "PHP (Scripting Language)",
    "postgresql-dba": "PostgreSQL",
    "power-bi": "Power BI",
    "product-design": "Product Design",
    "product-manager": "Product Management",
    "prompt-engineering": "Prompt Engineering",
    "python": "Python (Programming Language)",
    "python-data-analysis": "Python For Data Analysis",
    "qa": "Quality Assurance",
    "r": "R (Programming Language)",
    "r-programming": "R (Programming Language)",
    "react": "React.js (Javascript Library)",
    "react-native": "React Native",
    "redis": "Redis",
    "ruby": "Ruby (Programming Language)",
    "ruby-on-rails": "Ruby On Rails",
    "rust": "Rust (Programming Language)",
    "scala": "Scala (Programming Language)",
    "seo": "Search Engine Optimization",
    "shell-bash": "Bash (Scripting Language)",
    "software-architect": "Software Architecture",
    "software-design-architecture": "Software Design",
    "spring-boot": "Spring Boot",
    "sql": "SQL (Programming Language)",
    "swift-ui": "Swift (Programming Language)",
    "technical-writer": "Technical Writing",
    "terraform": "Terraform",
    "typescript": "TypeScript",
    "ux-design": "User Experience (UX)",
    "vue": "Vue.js (Javascript Library)",
    "wordpress": "WordPress",
}

_USE_ORDER = {name: index for index, name in enumerate(USE_CASES)}


def project_learning_repos(
    rows: list[dict[str, Any]],
    taxonomy_keys: list[str],
) -> list[dict[str, str]]:
    """Repos whose skill is on this path. One link per repo and skill."""
    wanted = set(taxonomy_keys)
    chosen: dict[tuple[str, str], dict[str, str]] = {}
    for row in rows:
        link = _link(row)
        if link is None or link["taxonomy_key"] not in wanted:
            continue
        slot = (link["html_url"], link["taxonomy_key"])
        current = chosen.get(slot)
        if current is None or len(link["roadmap_slug"]) < len(current["roadmap_slug"]):
            chosen[slot] = link
    return sorted(
        chosen.values(),
        key=lambda link: (
            _USE_ORDER[link["use_case"]],
            link["full_name"].lower(),
            link["roadmap_slug"],
        ),
    )


def _link(row: dict[str, Any]) -> dict[str, str] | None:
    owner = str(row.get("owner") or "").strip()
    name = str(row.get("name") or "").strip()
    url = str(row.get("html_url") or "").strip()
    roadmap = str(row.get("roadmap_slug") or "").strip()
    use_case = str(row.get("use_case") or "").strip()
    taxonomy_key = str(row.get("taxonomy_key") or "").strip()
    if not owner or not name or not roadmap or not taxonomy_key:
        return None
    if use_case not in _USE_ORDER:
        return None
    expected = f"https://github.com/{owner}/{name}"
    if url != expected:
        return None
    return {
        "full_name": f"{owner}/{name}",
        "html_url": url,
        "roadmap_slug": roadmap,
        "use_case": use_case,
        "taxonomy_key": taxonomy_key,
    }
