from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from myro_ops.context import OpsContext
from myro_ops.models import ToolResult, combine_status
from myro_ops.tools.repo_status import get_repo_status


def _join_url(base_url: str, path: str) -> str:
    return f"{base_url.rstrip('/')}/{path.lstrip('/')}"


def _check_url(url: str, *, label: str) -> str:
    request = Request(url, headers={"User-Agent": "myro-ops-agent/0.1"})
    with urlopen(request, timeout=5) as response:
        return f"{label}: HTTP {response.status}"


def _optional_url_checks(context: OpsContext) -> ToolResult:
    api_base = context.env.get("MYRO_API_BASE_URL", "").strip()
    web_base = context.env.get("MYRO_WEB_BASE_URL", "").strip()
    details: list[str] = []
    evidence: list[str] = []
    recommendations: list[str] = []
    status = "ready"

    checks: list[tuple[str, str]] = []
    if api_base:
        checks.extend(
            [
                (_join_url(api_base, "/health"), "API /health"),
                (_join_url(api_base, "/v1/status"), "API /v1/status"),
            ]
        )
    else:
        details.append("MYRO_API_BASE_URL not configured; skipped live API checks.")

    if web_base:
        checks.append((web_base, "Web base URL"))
    else:
        details.append("MYRO_WEB_BASE_URL not configured; skipped live web check.")

    for url, label in checks:
        evidence.append(f"GET {url}")
        try:
            details.append(_check_url(url, label=label))
        except HTTPError as exc:
            status = "degraded"
            details.append(f"{label}: HTTP {exc.code}")
            recommendations.append(f"Investigate live check failure for {label}.")
        except (TimeoutError, URLError, OSError) as exc:
            status = "degraded"
            details.append(f"{label}: unavailable ({exc.__class__.__name__})")
            recommendations.append(f"Investigate live check failure for {label}.")

    return ToolResult(
        name="live-health",
        status=status,
        summary="Optional live checks completed." if checks else "Optional live checks skipped.",
        details=details,
        evidence=evidence or ["environment configuration"],
        recommendations=recommendations,
    )


def get_health(context: OpsContext) -> ToolResult:
    results = [get_repo_status(context), _optional_url_checks(context)]
    status = combine_status(results)
    details: list[str] = []
    evidence: list[str] = []
    recommendations: list[str] = []
    for result in results:
        details.append(f"{result.name}: {result.summary}")
        details.extend(result.details)
        evidence.extend(result.evidence)
        recommendations.extend(result.recommendations)
    return ToolResult(
        name="health",
        status=status,
        summary="Website ops health checked from local repo context.",
        details=details,
        evidence=evidence,
        recommendations=recommendations or ["Run this before and after ops-agent changes."],
    )
