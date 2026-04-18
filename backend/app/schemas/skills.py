from pydantic import BaseModel


class SkillResponse(BaseModel):
    id: int
    taxonomy_key: str
    display_name: str
    lightcast_id: str | None = None
    l1_domain: str
    l2_cluster: str


class SkillsListResponse(BaseModel):
    skills: list[SkillResponse]
    total: int
