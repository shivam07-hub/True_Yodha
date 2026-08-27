"""Job Refresh seam — see CONTEXT.md "Job Refresh".

Two public facades — `start` and `status`. Everything else (XP debit/refund,
inline-vs-async dispatch, ranking pipeline) is private to this module.
"""

from app.services.job_refresh.facade import JobRefresh
from app.services.job_refresh.types import RefreshState, RefreshTicket
from app.services.job_refresh._dispatch import user_has_live_refresh

__all__ = ["JobRefresh", "RefreshState", "RefreshTicket", "user_has_live_refresh"]
