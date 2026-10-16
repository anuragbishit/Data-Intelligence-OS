from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


class LivePredictionRequest(BaseModel):
    features: dict[str, Any] = Field(..., description="Dictionary mapping feature names to their values")


class ClassProbability(BaseModel):
    class_name: str
    probability: float
    percentage: float


class FeatureContribution(BaseModel):
    feature: str
    value: Any
    baseline_value: Any | None = None
    contribution: float
    direction: Literal["positive", "negative", "neutral"]


class FeatureSchemaItem(BaseModel):
    name: str
    type: Literal["numeric", "categorical"]
    default_value: Any
    min_value: float | None = None
    max_value: float | None = None
    step: float | None = None
    options: list[str] | None = None


class PredictionSchemaResponse(BaseModel):
    run_id: str
    target_column: str
    task_type: Literal["classification", "regression"]
    features: list[FeatureSchemaItem]


class LivePredictionResponse(BaseModel):
    run_id: str
    task_type: Literal["classification", "regression"]
    target_column: str
    prediction: Any
    prediction_display: str
    confidence: float | None = None
    probabilities: list[ClassProbability] | None = None
    feature_contributions: list[FeatureContribution]
