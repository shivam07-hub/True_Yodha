"""The one place every Background Job handler module is imported.

`@background.handler` registers into a per-PROCESS dict. The web process used to
populate that dict as a side effect of its routers importing services, while the
Job Runner populated it from a hand-maintained import list in its entrypoint.
Nothing checked the two agreed, and they drifted: `onboarding_target_refresh`
was registered in web (so `enqueue`'s guard passed and the job was accepted) but
absent in the Runner, which logged "no handler — dropping" and then reported
"Job OK". Every signup between 2026-07-31 and 2026-08-03 lost its Myro Score to
that gap and sat on "Calculating your Myro Score" forever.

So: ONE list, imported by BOTH entrypoints. `test_background_registry` fails if
a module carrying an `@background.handler` is missing from it, so adding a
handler and forgetting the Runner is now a red test rather than a silent
production drop.

Import this for its side effects only — the imports below ARE the contents.
"""

from __future__ import annotations

import app.services.career_reservoir  # noqa: F401  role_dedup, story_ingest
import app.services.certificate_to_cv  # noqa: F401  certificate_to_cv
import app.services.cv_skill_edit  # noqa: F401  skill_retag
import app.services.cv_workflow  # noqa: F401  cv_upload_analysis, initial_match, …
import app.services.matching.on_demand  # noqa: F401  job_brain_eval
import app.services.matching.scrape_sweep  # noqa: F401  scrape_match_recompute
import app.services.onboarding_service  # noqa: F401  onboarding_target_refresh, provisional_baseline_score
import app.services.partner_broadcast  # noqa: F401  partner_broadcast
import app.services.partner_webhooks  # noqa: F401  partner_webhook_deliver
import app.services.skill_floor_pipeline  # noqa: F401  skill_floor_drain
from app.services.background.dispatch import registered_job_types

__all__ = ["registered_job_types"]
