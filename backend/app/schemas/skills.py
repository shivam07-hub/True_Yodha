from pydantic import BaseModel


class SkillResponse(BaseModel):
    id: int
    taxonomy_key: str
    display_name: str
    lightcast_id: str | None = None
    category: str       # Lightcast L1 — e.g. "Information Technology"
    subcategory: str    # Lightcast L2 — e.g. "Software Development"


class SkillsListResponse(BaseModel):
    skills: list[SkillResponse]
    total: int
