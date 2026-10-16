"""Tests for Live Single-Record Prediction service."""
import numpy as np
import pandas as pd
import pytest
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.services import artifacts
from app.services.prediction import build_prediction_schema, predict_single


@pytest.fixture
def dummy_pipeline(tmp_path, monkeypatch):
    rng = np.random.default_rng(42)
    n = 100
    X = pd.DataFrame({
        "age": rng.normal(30, 5, n),
        "income": rng.normal(50000, 10000, n),
    })
    y = (X["age"] + X["income"] / 2000 > 55).astype(int)

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("model", LogisticRegression()),
    ])
    pipeline.fit(X, y)

    rel_path = artifacts.save_model(pipeline, "test_run_123", "logistic_regression")
    return rel_path, pipeline


def test_build_prediction_schema():
    payload = {
        "training": {
            "task_type": "classification",
            "features_used": ["age", "gender"],
            "numeric_columns": ["age"],
            "categorical_columns": ["gender"],
        },
        "plan": {
            "target_column": "churn",
        },
    }
    profile = {
        "columns": [
            {
                "name": "age",
                "semantic_type": "numeric",
                "stats": {"mean": 35.0, "min": 18.0, "max": 75.0, "median": 34.0},
            },
            {
                "name": "gender",
                "semantic_type": "categorical",
                "top_values": [{"value": "Female", "count": 55}, {"value": "Male", "count": 45}],
            },
        ]
    }

    schema = build_prediction_schema(payload, profile)
    assert schema["target_column"] == "churn"
    assert schema["task_type"] == "classification"
    assert len(schema["features"]) == 2

    age_feat = next(f for f in schema["features"] if f["name"] == "age")
    assert age_feat["type"] == "numeric"
    assert age_feat["default_value"] == 34.0
    assert age_feat["min_value"] == 18.0
    assert age_feat["max_value"] == 75.0

    gender_feat = next(f for f in schema["features"] if f["name"] == "gender")
    assert gender_feat["type"] == "categorical"
    assert "Female" in gender_feat["options"]


def test_predict_single_classification(dummy_pipeline):
    rel_path, _ = dummy_pipeline
    output_payload = {
        "training": {
            "task_type": "classification",
            "features_used": ["age", "income"],
            "numeric_columns": ["age", "income"],
            "best_model": "logistic_regression",
        },
        "plan": {
            "target_column": "target",
        },
        "explanation": {
            "features": [
                {"feature": "income", "importance": 0.6},
                {"feature": "age", "importance": 0.4},
            ]
        },
    }

    profile = {
        "columns": [
            {"name": "age", "semantic_type": "numeric", "stats": {"mean": 30.0, "min": 20.0, "max": 60.0}},
            {"name": "income", "semantic_type": "numeric", "stats": {"mean": 50000.0, "min": 20000.0, "max": 100000.0}},
        ]
    }

    result = predict_single(
        model_path=rel_path,
        output_payload=output_payload,
        features={"age": 45.0, "income": 75000.0},
        dataset_profile=profile,
    )

    assert result["task_type"] == "classification"
    assert result["target_column"] == "target"
    assert result["prediction"] in (0, 1)
    assert result["confidence"] is not None
    assert len(result["probabilities"]) == 2
    assert len(result["feature_contributions"]) == 2

    # Verify contributions have expected keys
    for c in result["feature_contributions"]:
        assert "feature" in c
        assert "contribution" in c
        assert c["direction"] in ("positive", "negative", "neutral")
