from typing import Literal

from pydantic import BaseModel, ConfigDict


class HealthResponse(BaseModel):
    # `model_version` is a contract field name, not pydantic's own namespace.
    model_config = ConfigDict(protected_namespaces=())

    status: Literal["ok"]
    model_version: str
    llm: Literal["up", "down"]
