import os
from dataclasses import dataclass, field
from pathlib import Path
from types import MappingProxyType
from typing import Mapping


@dataclass(frozen=True)
class OpsContext:
    repo_root: Path
    agent_root: Path
    instructions: str
    env: Mapping[str, str] = field(default_factory=lambda: MappingProxyType(dict(os.environ)))


def find_repo_root(start: Path | None = None) -> Path:
    current = (start or Path.cwd()).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / "AGENTS.md").exists() and (candidate / "docs").exists():
            return candidate
    package_root = Path(__file__).resolve().parents[2]
    return package_root.parent


def load_context(start: Path | None = None) -> OpsContext:
    repo_root = find_repo_root(start)
    agent_root = repo_root / "ops-agent"
    instructions_path = agent_root / "instructions.md"
    instructions = instructions_path.read_text(encoding="utf-8") if instructions_path.exists() else ""
    return OpsContext(
        repo_root=repo_root,
        agent_root=agent_root,
        instructions=instructions,
    )
