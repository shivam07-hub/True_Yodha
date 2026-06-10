from pydantic import BaseModel, Field


class XPBalanceResponse(BaseModel):
    balance: int


class XPSpendRequest(BaseModel):
    amount: int = Field(gt=0)
    action: str = Field(min_length=1)
