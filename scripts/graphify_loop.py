"""The loop graph: what the cockpit says, and the code it points at.

Starts at CLAUDE.md and follows every repo path a doc cites, doc to doc and
doc to code, until nothing new turns up. That set is the loop's own knowledge:
the specs, the decisions, and the files they name as owners. It is small enough
to read, unlike the whole-repo graph beside it.

Writes graphify-out/graph_loop.json, GRAPH_REPORT_loop.md and graph_loop.html.
graphify-out/ is gitignored, so these never show in git status. The unsuffixed
graph.json is the whole repo and graph_frontend.json is the frontend AST; this
script touches neither.

Run it after a spec chunk ships or a spec changes:

    $(cat graphify-out/.graphify_python) scripts/graphify_loop.py

Code is read by AST and costs nothing. Docs need a model read once; after that
graphify's cache serves them until the file changes. The run prints the docs
whose read is missing or stale. `--corpus` prints the file list and stops.
`--check` asserts the walk still finds what it must.
"""
from __future__ import annotations

import fnmatch
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "graphify-out"
START = "CLAUDE.md"

#: Cited by the cockpit, not part of the loop: history, marketing, upstream repos.
SKIP_DOCS = (
    "ARCHIVE.md",
    "NEWSLETTER_QUEUE.md",
    "MARKETING_SCHEDULE.md",
    "LAUNCH_VIDEOS.md",
    "repos/README.md",
    "AGENTS.md",
    "INSTAGRAM_PROFILE.md",
)
SKIP_PARTS = (
    "node_modules/", "graphify-out/", ".next/", "__pycache__/", "repos/",
    "scripts/newsletter-carousel-specs/",
)
DOC_EXT = (".md",)
CODE_EXT = (".py", ".ts", ".tsx", ".mjs", ".js", ".sql")

#: `path/to/file.ext`. Brackets and parens stay in the class because Next.js
#: routes use them (`app/(authed)/cv`, `connect/[partner]`); `*` because the
#: cockpit cites its specs as `ARCHITECTURE_*.md`.
_CITED = re.compile(r"[\w@()\[\]*./-]+\.(?:md|py|tsx|ts|mjs|js|sql)\b")
#: Decisions are cited by number (`ADR-0024`), never by path.
_ADR = re.compile(r"\bADR-(\d{4})\b")


def tracked_files() -> list[str]:
    out = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout
    return [f for f in out.splitlines() if not any(p in f for p in SKIP_PARTS)]


def resolve(token: str, files: list[str], by_suffix: dict[str, list[str]]) -> list[str]:
    """A cited path to the tracked file it names. Specs cite paths from several
    roots (`lib/cv/x.ts`, `routers/jobs/list.py`), so match on the path's tail
    and keep it only when exactly one file ends that way. A glob names every
    root file it matches. A bare file name counts only when it is a root file."""
    token = token.lstrip("[(").rstrip(")]").lstrip("./")
    if "*" in token:
        return [f for f in files if "/" not in f and fnmatch.fnmatchcase(f, token)]
    if token in files:
        return [token]
    if "/" not in token:
        return []
    hits = [f for f in by_suffix.get(token.rsplit("/", 1)[-1], []) if f.endswith("/" + token)]
    return hits if len(hits) == 1 else []


def loop_corpus() -> tuple[list[str], list[str]]:
    """(docs, code) reached from the cockpit. Docs are followed; code is a leaf."""
    files = tracked_files()
    by_suffix: dict[str, list[str]] = {}
    for f in files:
        by_suffix.setdefault(f.rsplit("/", 1)[-1], []).append(f)

    docs: list[str] = []
    code: list[str] = []
    seen = {START}
    queue = [START]
    while queue:
        doc = queue.pop(0)
        docs.append(doc)
        text = (ROOT / doc).read_text(encoding="utf-8", errors="replace")
        # `[label](target)` is two citations, not one token.
        cited = [resolve(token, files, by_suffix) for token in _CITED.findall(text.replace("](", " "))]
        cited += [
            [f for f in files if f.startswith(f"docs/adr/{number}-")]
            for number in _ADR.findall(text)
        ]
        for paths in cited:
            for path in paths:
                if path in seen or path in SKIP_DOCS:
                    continue
                seen.add(path)
                if path.endswith(DOC_EXT):
                    queue.append(path)
                elif path.endswith(CODE_EXT):
                    code.append(path)
    return sorted(docs), sorted(code)


def _label(members: list[str], graph) -> str:
    """Name a community by the file most of its nodes come from. No model."""
    sources = Counter(
        (graph.nodes[n].get("source_file") or "").replace(str(ROOT) + "/", "")
        for n in members
    )
    sources.pop("", None)
    if not sources:
        return "unsourced"
    top, _ = sources.most_common(1)[0]
    return top.rsplit("/", 1)[-1]


def build() -> None:
    from graphify.analyze import god_nodes, suggest_questions, surprising_connections
    from graphify.build import build_from_json
    from graphify.cache import check_semantic_cache
    from graphify.cluster import cluster, score_all
    from graphify.export import to_html, to_json
    from graphify.extract import extract
    from graphify.report import generate

    docs, code = loop_corpus()
    ast = extract([ROOT / f for f in code], cache_root=ROOT) if code else {"nodes": [], "edges": []}

    doc_paths = [str(ROOT / f) for f in docs]
    nodes, edges, hyperedges, uncached = check_semantic_cache(doc_paths)

    seen = {n["id"] for n in ast["nodes"]}
    merged_nodes = list(ast["nodes"])
    for node in nodes:
        if node["id"] not in seen:
            seen.add(node["id"])
            merged_nodes.append(node)
    extraction = {
        "nodes": merged_nodes,
        "edges": ast["edges"] + edges,
        "hyperedges": hyperedges,
        "input_tokens": 0,
        "output_tokens": 0,
    }

    graph = build_from_json(extraction)
    if graph.number_of_nodes() == 0:
        raise SystemExit("ERROR: the loop graph is empty.")
    communities = cluster(graph)
    cohesion = score_all(graph, communities)
    labels = {cid: _label(members, graph) for cid, members in communities.items()}
    words = sum(len((ROOT / f).read_text(encoding="utf-8", errors="replace").split()) for f in docs + code)
    detection = {
        "total_files": len(docs) + len(code),
        "total_words": words,
        "needs_graph": True,
        "warning": None,
        "files": {"code": code, "document": docs, "paper": [], "image": []},
    }
    report = generate(
        graph, communities, cohesion, labels,
        god_nodes(graph), surprising_connections(graph, communities),
        detection, {"input": 0, "output": 0}, "the loop (from CLAUDE.md)",
        suggested_questions=suggest_questions(graph, communities, labels),
    )
    OUT.mkdir(exist_ok=True)
    (OUT / "GRAPH_REPORT_loop.md").write_text(report, encoding="utf-8")
    to_json(graph, communities, str(OUT / "graph_loop.json"))
    to_html(graph, communities, str(OUT / "graph_loop.html"), community_labels=labels)
    (OUT / "loop_corpus.json").write_text(
        json.dumps({"docs": docs, "code": code, "docs_needing_a_read": [
            u.replace(str(ROOT) + "/", "") for u in uncached
        ]}, indent=2),
        encoding="utf-8",
    )
    print(
        f"loop graph: {len(docs)} docs + {len(code)} code files -> "
        f"{graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges, "
        f"{len(communities)} communities"
    )
    if uncached:
        print(f"{len(uncached)} doc(s) have no current model read (see loop_corpus.json):")
        for path in uncached:
            print("  ", path.replace(str(ROOT) + "/", ""))


def check() -> None:
    docs, code = loop_corpus()
    assert START in docs
    assert "ARCHITECTURE_RETENTION.md" in docs, "the cockpit no longer reaches the retention spec"
    assert "frontend/lib/cv/tailor-order.ts" in code, "a spec's cited owner did not resolve"
    assert not any(d in docs for d in SKIP_DOCS)
    assert all((ROOT / f).is_file() for f in docs + code)
    print(f"ok: {len(docs)} docs, {len(code)} code files")


if __name__ == "__main__":
    if "--check" in sys.argv:
        check()
    elif "--corpus" in sys.argv:
        found_docs, found_code = loop_corpus()
        print(json.dumps({"docs": found_docs, "code": found_code}, indent=2))
    else:
        build()
