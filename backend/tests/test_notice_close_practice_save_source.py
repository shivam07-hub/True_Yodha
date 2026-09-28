"""Close proof: the skill-upvote toggle's practice save.

`POST /users/me/skill-upvotes/toggle` saves practice with source
`job_upvote`; the CHECK on `practice_saves.source` did not list it until
20260908_practice_save_source_job_upvote.sql, so the upvote 500'd.
"""
import re
from pathlib import Path

from app.routers.users import _UPVOTE_PRACTICE_SOURCE

NOTICE_CAUSE_KEY = "unhandled_500:APIError:app/repositories/users.py:add_practice_save"

_MIGRATIONS = Path(__file__).parents[2] / "database/migrations"


def test_the_upvote_source_is_one_the_table_accepts() -> None:
    last = sorted(
        p for p in _MIGRATIONS.glob("*.sql")
        if "practice_saves_source_check" in p.read_text()
        and "ADD CONSTRAINT" in p.read_text().upper()
    )[-1]
    check = re.search(r"CHECK\s*\(source IN \(([^)]*)\)\)", last.read_text(), re.S)
    assert check is not None, last.name
    assert f"'{_UPVOTE_PRACTICE_SOURCE}'" in check.group(1)
