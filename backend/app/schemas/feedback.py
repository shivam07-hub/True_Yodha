from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# Legacy types remain for older clients. New types power the Feedback Hub.
FeedbackType = Literal[
    "bug",
    "idea",
    "question",
    "praise",
    "feedback",
    "company",
]
FeedbackStatus = Literal["received", "triaged", "in_progress", "shipped", "closed"]

RoleStream = Literal["Product", "Design", "Marketing", "Operations", "Other"]
DeviceType = Literal["Mobile", "Laptop", "Desktop", "Tablet"]
OperatingSystem = Literal["Android", "iOS", "Windows", "macOS", "Linux", "Other"]
Browser = Literal["Chrome", "Safari", "Edge", "Firefox", "Other"]
ConnectionType = Literal["Wi-Fi", "Mobile data", "Mixed", "Unknown"]
SessionOutcome = Literal["Completed", "Partial", "Blocked before a result"]
TimeToValue = Literal[
    "Under 5 minutes",
    "5-10 minutes",
    "11-20 minutes",
    "21-30 minutes",
    "No useful result",
]
ProductArea = Literal[
    "Landing and signup",
    "CV upload",
    "CV analysis or Myro Score",
    "CV Hub or tailoring",
    "Skills or Practice",
    # Legacy alias, kept accepted-only. The frontend stopped sending it on
    # 2026-08-06 (Forge→Practice rename), but Vercel and Railway deploy from
    # Develop independently, so a browser holding the old bundle can still POST
    # this string for a few minutes. Drop it once no rows carry it.
    "Skills or Forge",
    "Jobs or matches",
    "Intel",
    "Tracker",
    "Diary",
    "Settings or feedback",
    "Other",
]


class FeedbackRequest(BaseModel):
    type: FeedbackType
    payload: dict


class FeedbackReport(BaseModel):
    id: int
    type: FeedbackType
    status: FeedbackStatus
    payload: dict
    created_at: str


class FeedbackReceipt(BaseModel):
    ok: bool = True
    id: int
    replayed: bool


class BetaAssignmentRequest(BaseModel):
    role_stream: RoleStream
    device_type: DeviceType
    operating_system: OperatingSystem
    browser: Browser
    connection_type: ConnectionType
    session_outcome: SessionOutcome
    time_to_value: TimeToValue
    areas_explored: list[ProductArea] = Field(min_length=1, max_length=11)
    product_understanding: str = Field(min_length=10, max_length=2000)
    most_useful_moment: str = Field(min_length=10, max_length=2000)
    biggest_problem_area: ProductArea
    biggest_problem: str = Field(min_length=10, max_length=2000)
    attempted_action: str = Field(min_length=10, max_length=2000)
    expected_result: str = Field(min_length=10, max_length=2000)
    actual_result: str = Field(min_length=10, max_length=2000)
    reproduction_steps: str | None = Field(default=None, max_length=2000)
    priority_improvement: str = Field(min_length=10, max_length=2000)
    priority_reason: str = Field(min_length=10, max_length=2000)
    preserve: str = Field(min_length=10, max_length=2000)
    return_trigger: str = Field(min_length=10, max_length=2000)
    rating_next_step: int = Field(ge=1, le=5)
    rating_trust: int = Field(ge=1, le=5)
    rating_relevance: int = Field(ge=1, le=5)
    rating_return: int = Field(ge=1, le=5)
    rating_recommend: int = Field(ge=1, le=5)
    privacy_confirmation: Literal[True]
    independent_work_confirmation: Literal[True]
    final_submission_confirmation: Literal[True]


class BetaAssignmentReceipt(BaseModel):
    id: int
    submitted_at: str


class BetaAssignmentStatus(BaseModel):
    submitted: bool
    receipt: BetaAssignmentReceipt | None
