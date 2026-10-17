"""Load synced newsletter issues and find each issue's chart PNG.

The chart is the OG or hero PNG under ``frontend/public`` when that file
exists. SVG and HTML dashboards are not images the editor can upload.
A carousel directory is used only when it holds one PNG, or one file whose
name says og/chart. A slide deck is not guessed down to a single frame.
"""

from __future__ import annotations

import re
from pathlib import Path

from newsletter_substack.convert import DraftSpec, convert_issue

REPO = Path(__file__).resolve().parents[2]
ISSUES_DIR = REPO / "frontend" / "content" / "newsletter" / "issues"


def load_issues(repo: Path | None = None) -> list[DraftSpec]:
    root = repo or REPO
    directory = root / "frontend" / "content" / "newsletter" / "issues"
    paths = sorted(
        path for path in directory.glob("*.mdx") if not path.name.startswith("_")
    )
    specs = [load_issue(path, root) for path in paths]
    return sorted(specs, key=lambda spec: (spec.issue_number, spec.slug))


def load_issue(path: Path, repo: Path | None = None) -> DraftSpec:
    root = repo or REPO
    frontmatter, body = _split_frontmatter(path.read_text(encoding="utf-8"), path)
    fields = _top_level(frontmatter, path)
    for key in ("title", "slug", "summary", "issueNumber"):
        if key not in fields:
            raise ValueError(f"{path.name}: missing {key}")
    if fields["slug"] != path.stem:
        raise ValueError(
            f"{path.name}: slug {fields['slug']!r} does not match the filename"
        )
    issue_number = int(fields["issueNumber"])
    og_image = fields.get("ogImage") or None
    chart = resolve_chart_png(root, og_image, issue_number)
    return convert_issue(
        body,
        slug=fields["slug"],
        title=fields["title"],
        subtitle=fields["summary"],
        issue_number=issue_number,
        chart_path=chart,
        chart_alt=fields.get("ogImageAlt") or None,
    )


def issue_by_slug(slug: str, repo: Path | None = None) -> DraftSpec:
    matches = [spec for spec in load_issues(repo) if spec.slug == slug]
    if not matches:
        raise ValueError(f"no synced newsletter issue with slug {slug!r}")
    if len(matches) > 1:
        raise ValueError(f"more than one issue with slug {slug!r}")
    return matches[0]


def resolve_chart_png(
    repo: Path, og_image: str | None, issue_number: int
) -> Path | None:
    public = repo / "frontend" / "public"
    if og_image and og_image.lower().endswith(".png"):
        candidate = (public / og_image.lstrip("/")).resolve()
        if not _inside(candidate, public.resolve()):
            raise ValueError(f"ogImage escapes frontend/public: {og_image}")
        if candidate.is_file():
            return candidate
    newsletter = public / "newsletter"
    token = f"{issue_number:03d}"
    for name in (f"issue-{token}-og.png", f"issue-{token}-hero.png"):
        candidate = newsletter / name
        if candidate.is_file():
            return candidate
    return _carousel_png(repo, token)


def _carousel_png(repo: Path, token: str) -> Path | None:
    root = repo / "Myro Newsletter"
    if not root.is_dir():
        return None
    pngs: list[Path] = []
    for directory in root.iterdir():
        if not directory.is_dir():
            continue
        if re.search(rf"(?<!\d){token}(?!\d)", directory.name) is None:
            continue
        pngs.extend(path for path in directory.rglob("*.png") if path.is_file())
    named = [
        path
        for path in pngs
        if "og" in path.name.lower() or "chart" in path.name.lower()
    ]
    if len(named) == 1:
        return named[0]
    if len(pngs) == 1:
        return pngs[0]
    return None


def _inside(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def _split_frontmatter(text: str, path: Path) -> tuple[str, str]:
    if not text.startswith("---\n"):
        raise ValueError(f"{path.name}: no frontmatter")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise ValueError(f"{path.name}: frontmatter is not closed")
    return text[4:end], text[end + 5 :]


def _top_level(frontmatter: str, path: Path) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in frontmatter.splitlines():
        if not line or line[0] in " \t" or line.startswith("-"):
            continue
        if ": " not in line:
            continue
        key, value = line.split(": ", 1)
        fields[key] = value.strip().strip('"').strip("'")
    if not fields:
        raise ValueError(f"{path.name}: frontmatter has no fields")
    return fields
