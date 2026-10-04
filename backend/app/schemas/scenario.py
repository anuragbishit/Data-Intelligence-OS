from typing import Literal

from pydantic import BaseModel, Field

ScenarioOperation = Literal[
    "increase_percent",
    "decrease_percent",
    "add",
    "subtract",
    "multiply",
    "divide",
    "set",
]


class ScenarioRequest(BaseModel):
    feature: str = Field(min_length=1, max_length=200)
    operation: ScenarioOperation
    value: float | str
