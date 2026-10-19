"""One ADR number means one decision.

`ADR-0021` was cited in live code for two unrelated decisions at once — the
Notice mailbox retirement and the reservoir-as-Master-CV — because two files
claimed the number four days apart. A citation that resolves to two documents
is worse than no citation: every reader picks the wrong one half the time.

This is a repo-shape test rather than a code test, and it lives in pytest
because pytest is in the five gates every agent runs.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

ADR_DIR = Path(__file__).resolve().parents[2] / "docs" / "adr"
_NUMBERED = re.compile(r"^(\d{4})-")


def _numbered_adrs() -> dict[str, list[str]]:
    by_number: dict[str, list[str]] = {}
    for path in sorted(ADR_DIR.glob("*.md")):
        match = _NUMBERED.match(path.name)
        if match:
            by_number.setdefault(match.group(1), []).append(path.name)
    return by_number


def test_adr_directory_is_present_and_tracked():
    """docs/ is gitignored except adr/. If this fails, the negation was dropped
    and every ADR is invisible to every other machine again."""
    assert ADR_DIR.is_dir(), f"no ADR directory at {ADR_DIR}"
    assert _numbered_adrs(), "no numbered ADRs found — check .gitignore's !/docs/adr/"


def test_no_two_adrs_claim_the_same_number():
    clashes = {n: files for n, files in _numbered_adrs().items() if len(files) > 1}
    assert not clashes, (
        "each ADR number must name exactly one decision; a companion document "
        f"belongs outside the numeric sequence: {clashes}"
    )


# ── an ADR may not point at something that is not there ──────────────────────
#
# Five ADRs cited `MYRO_TUTOR_DESIGN.md` for three months after the file stopped
# existing and the product was renamed Mentor; ADR-0001 named the crawler at a
# path it had moved from; ADR-0004 superseded a file that was later deleted. A
# pointer that resolves to nothing is worse than no pointer: the reader assumes
# the decision moved somewhere they cannot find, and stops trusting the estate.
#
# The rule is not "never mention a deleted file" — history has to name what it
# replaced. It is "say so in the same breath".

_PATH = re.compile(r"`([A-Za-z0-9_./-]+\.(?:md|py|ts|tsx|sql|css|mjs|json))`")

#: An ADR writes the path a developer would recognise, not one rooted at the repo
#: top: `routers/users.py` and `lib/views/triad.ts` are both real.
_ROOTS = ("", "backend/app", "backend", "frontend", "docs", "database/migrations")

#: Said in the same paragraph, any of these makes a dangling pointer deliberate.
_EXCUSED = (
    "delet", "retire", "gone", "no longer", "does not exist", "never created",
    "never issued", "never tracked", "gitignore", "stale", "moved", "renamed",
    "superseded",
)

#: The scraper is a separate repo by ADR-0001; its files are real and not here.
#: A citation names that repo in the path itself. Naming the crawler anywhere in
#: a paragraph used to excuse every path in it, which is how ADR-0001 kept a
#: crawler folder that no longer existed.
_SISTER_REPOS = ("myro-job-scraper/",)


def _repo_root() -> Path:
    return ADR_DIR.parents[1]


def _tracked_relpaths() -> set[str]:
    """The clone a CI runner has — not this laptop's worktrees or gitignored graph."""
    result = subprocess.run(
        ["git", "-C", str(_repo_root()), "ls-files"],
        capture_output=True,
        text=True,
        check=False,
    )
    return {line.strip().replace("\\", "/") for line in result.stdout.splitlines() if line.strip()}


def _tracked_names(relpaths: set[str]) -> set[str]:
    return {Path(path).name for path in relpaths}


def _prefixed(cited: str) -> list[str]:
    return [f"{prefix}/{cited}" if prefix else cited for prefix in _ROOTS]


def _resolves(cited: str, relpaths: set[str], names: set[str]) -> bool:
    if cited.startswith(_SISTER_REPOS):
        return True
    if any(candidate in relpaths for candidate in _prefixed(cited)):
        return True
    # Bare filename is prose. A path with directories must be that path, not
    # a same-named file in a worktree or another folder.
    return "/" not in cited and cited in names


def _paragraphs(text: str) -> list[str]:
    return [block for block in text.split("\n\n") if block.strip()]


def test_a_path_only_in_a_worktree_does_not_satisfy_a_citation() -> None:
    relpaths = {"frontend/components/shell/authed-top-strip.tsx"}
    names = _tracked_names(relpaths)
    assert _resolves("components/shell/web-chrome.tsx", relpaths, names) is False
    assert _resolves("components/shell/authed-top-strip.tsx", relpaths, names) is True


def test_a_gitignored_artifact_does_not_satisfy_a_citation() -> None:
    assert _resolves("graphify-out/GRAPH_REPORT_frontend.md", set(), set()) is False


def test_a_bare_filename_matches_a_tracked_basename() -> None:
    relpaths = {"frontend/lib/views/triad.ts"}
    names = _tracked_names(relpaths)
    assert _resolves("triad.ts", relpaths, names) is True
    assert _resolves("other/triad.ts", relpaths, names) is False


def test_a_sister_repo_path_is_allowed_only_by_its_prefix() -> None:
    assert _resolves("myro-job-scraper/KNOWN_PORTALS.md", set(), set()) is True
    assert _resolves("KNOWN_PORTALS.md", set(), set()) is False


def test_naming_the_crawler_does_not_excuse_a_dead_path() -> None:
    block = "The crawler keeps its portal list in `scraper/KNOWN_PORTALS.md`."
    assert not any(word in block.lower() for word in _EXCUSED)


#: A path on one laptop resolves on that laptop only — not on CI, not in Codex,
#: not on a fresh clone. ADR-0001 named the crawler at two of them in turn, and
#: both stopped existing while the ADR still pointed there.
_LAPTOP_PATH = re.compile(r"`(?:/Users/|/home/|~/)[^`]*`")


def test_no_adr_cites_a_laptop_path():
    cited = [
        f"{path.name}: {match}"
        for path in sorted(ADR_DIR.glob("*.md"))
        for match in _LAPTOP_PATH.findall(path.read_text())
    ]
    assert not cited, f"name the repo, not the folder on one machine: {cited}"


def test_no_adr_points_at_a_file_that_is_not_there():
    relpaths = _tracked_relpaths()
    names = _tracked_names(relpaths)
    broken: list[str] = []
    for path in sorted(ADR_DIR.glob("*.md")):
        for block in _paragraphs(path.read_text()):
            excused = any(word in block.lower() for word in _EXCUSED)
            for cited in _PATH.findall(block):
                if _resolves(cited, relpaths, names) or excused:
                    continue
                broken.append(f"{path.name}: `{cited}`")
    assert not broken, (
        "an ADR cites a path that is not in the git tree, and its paragraph "
        f"does not say so: {broken}"
    )


_STATUS = re.compile(r"status\*{0,2}\s*:", re.IGNORECASE)


def test_every_adr_declares_a_status():
    """A decision with no status is one nobody can tell is still in force."""
    missing = [
        path.name
        for path in sorted(ADR_DIR.glob("*.md"))
        if _NUMBERED.match(path.name) and not _STATUS.search(path.read_text())
    ]
    assert not missing, f"every ADR must carry a Status line: {missing}"
