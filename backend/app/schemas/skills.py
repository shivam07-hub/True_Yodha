from pydantic import BaseModel


class SkillLevelResponse(BaseModel):
    level: int          # 1–5
    label: str          # Foundation / Practitioner / Professional / Expert / Authority
    description: str    # benchmark definition


class SkillResponse(BaseModel):
    id: int
    taxonomy_key: str
    display_name: str
    domain_code: str
    family_code: str
    demand_trend: str   # rising | stable | falling
    levels: list[SkillLevelResponse] = []


class SkillDomainResponse(BaseModel):
    id: int
    code: str           # SD, DE, DSA, AML, CDO, CS, QAT, EA, PPM, UX
    name: str
    description: str | None
    skills: list[SkillResponse] = []


class SkillsListResponse(BaseModel):
    skills: list[SkillResponse]
    total: int


class DomainsListResponse(BaseModel):
    domains: list[SkillDomainResponse]
