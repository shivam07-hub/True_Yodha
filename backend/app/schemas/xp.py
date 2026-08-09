from pydantic import BaseModel


class XPBalanceResponse(BaseModel):
    balance: int
