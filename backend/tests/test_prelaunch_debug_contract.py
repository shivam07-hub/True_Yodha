from pathlib import Path
import re


REPO_ROOT = Path(__file__).resolve().parents[2]
RUNTIME_ROOTS = (
    REPO_ROOT / "backend" / "app",
    REPO_ROOT / "frontend" / "app",
    REPO_ROOT / "frontend" / "components",
    REPO_ROOT / "frontend" / "lib",
    REPO_ROOT / "frontend" / "mobile",
    REPO_ROOT / "frontend" / "store",
    REPO_ROOT / "Chrome_extension" / "src",
    REPO_ROOT / "ops-agent" / "myro_ops",
)
SOURCE_SUFFIXES = {".js", ".mjs", ".py", ".ts", ".tsx"}


def _runtime_sources() -> list[Path]:
    return [
        path
        for root in RUNTIME_ROOTS
        for path in root.rglob("*")
        if path.is_file() and path.suffix in SOURCE_SUFFIXES
    ]


def test_runtime_sources_have_no_prelaunch_debug_artifacts() -> None:
    forbidden = {
        "debug console": re.compile(r"\bconsole\.(?:log|debug|trace)\s*\("),
        "test-only route": re.compile(
            r"""["']/(?:test|debug|admin-backdoor|seed-data)(?:/|["'])"""
        ),
        "test credential": re.compile(
            r"(?i)(?:test@example\.com|admin@example\.com|password123|"
            r"test-password|sk-test)"
        ),
        "commented-out code": re.compile(
            r"(?m)^\s*(?://|#)\s*(?:(?:const|let|var)\s+\w+\s*=|"
            r"(?:def|class|function)\s+\w+\s*\()"
        ),
    }
    findings: list[str] = []
    for path in _runtime_sources():
        source = path.read_text(errors="replace")
        for label, pattern in forbidden.items():
            if pattern.search(source):
                findings.append(f"{path.relative_to(REPO_ROOT)}: {label}")
        for line_number, line in enumerate(source.splitlines(), start=1):
            if re.search(r"\b(?:TODO|FIXME)\b", line, flags=re.IGNORECASE) and re.search(
                r"\b(?:security|secure|auth|password|secret|token|permission|"
                r"access|rls|cors|encrypt|backdoor)\b",
                line,
                flags=re.IGNORECASE,
            ):
                findings.append(
                    f"{path.relative_to(REPO_ROOT)}:{line_number}: incomplete security"
                )

    assert findings == []
