import numpy as np
import pandas as pd
import pytest
from types import SimpleNamespace
from sklearn.linear_model import LinearRegression
from sklearn.pipeline import Pipeline
from sklearn.tree import DecisionTreeClassifier

from app.services import scenarios


@pytest.mark.parametrize(
    ("operation", "value", "expected"),
    [
        ("increase_percent", 10, [11, 22]),
        ("decrease_percent", 10, [9, 18]),
        ("add", 5, [15, 25]),
        ("subtract", 5, [5, 15]),
        ("multiply", 2, [20, 40]),
        ("divide", 2, [5, 10]),
        ("set", 7, [7, 7]),
    ],
)
def test_numeric_scenario_operations_copy_and_change_values(operation, value, expected):
    original = pd.DataFrame({"score": [10.0, 20.0]})

    changed, evidence = scenarios.apply_feature_change(
        original, "score", operation, value
    )

    assert changed["score"].tolist() == expected
    assert original["score"].tolist() == [10.0, 20.0]
    assert evidence["rows_changed"] == 2


def test_categorical_set_records_an_unseen_value():
    original = pd.DataFrame({"plan": ["basic", "premium", "basic"]})

    changed, evidence = scenarios.apply_feature_change(
        original, "plan", "set", "enterprise"
    )

    assert changed["plan"].tolist() == ["enterprise"] * 3
    assert original["plan"].tolist() == ["basic", "premium", "basic"]
    assert evidence["unseen_category"] is True


@pytest.mark.parametrize(
    ("feature", "operation", "value", "error"),
    [
        ("score", "divide", 0, "divided by zero"),
        ("plan", "add", 1, "requires a numeric feature"),
        ("score", "decrease_percent", 101, "cannot exceed 100%"),
    ],
)
def test_invalid_scenario_changes_are_rejected(feature, operation, value, error):
    frame = pd.DataFrame({"score": [2.0, 4.0], "plan": ["a", "b"]})

    with pytest.raises(ValueError, match=error):
        scenarios.apply_feature_change(frame, feature, operation, value)


def test_classifier_scenario_uses_fitted_predictions(tmp_path, monkeypatch):
    training = pd.DataFrame({"score": np.arange(10, dtype=float)})
    labels = np.array([0] * 5 + [1] * 5)
    model = Pipeline([("model", DecisionTreeClassifier(max_depth=1, random_state=0))])
    model.fit(training, labels)

    dataset_path = tmp_path / "classifier.csv"
    training.to_csv(dataset_path, index=False)
    monkeypatch.setattr(scenarios.artifacts, "load_model", lambda _path: model)

    result = scenarios.evaluate_scenario(
        "models/run/model.joblib",
        dataset_path,
        ["score"],
        "classification",
        "score",
        "increase_percent",
        100,
        dataset_rows=10,
    )

    assert result["baseline_result"]["predicted_class_distribution"] == [
        {"class": 0, "count": 5, "rate_percent": 50.0},
        {"class": 1, "count": 5, "rate_percent": 50.0},
    ]
    assert result["impact"]["changed_prediction_count"] == 2
    assert result["impact"]["focus_class"] == 1
    assert result["data_scope"]["rows_evaluated"] == 10
    pd.testing.assert_frame_equal(pd.read_csv(dataset_path), training)


def test_regression_scenario_reports_mean_absolute_and_relative_change(
    tmp_path, monkeypatch
):
    training = pd.DataFrame({"score": np.arange(10, dtype=float)})
    target = training["score"] * 2 + 5
    model = Pipeline([("model", LinearRegression())])
    model.fit(training, target)

    dataset_path = tmp_path / "regression.csv"
    training.to_csv(dataset_path, index=False)
    monkeypatch.setattr(scenarios.artifacts, "load_model", lambda _path: model)

    result = scenarios.evaluate_scenario(
        "models/run/model.joblib",
        dataset_path,
        ["score"],
        "regression",
        "score",
        "add",
        2,
        dataset_rows=10,
    )

    assert result["baseline_result"]["mean_prediction"] == 14.0
    assert result["scenario_result"]["mean_prediction"] == 18.0
    assert result["impact"]["absolute_change"] == 4.0
    assert result["impact"]["percentage_change"] == pytest.approx(round(4 / 14 * 100, 3))


@pytest.mark.anyio
async def test_scenario_ai_separates_action_and_omits_profiled_rows(monkeypatch):
    class EvidenceLLM:
        async def ainvoke(self, messages):
            human_message = messages[1][1]
            assert "dataset_rows_profiled" not in human_message
            assert "rows_evaluated" in human_message
            return type("Message", (), {
                "content": (
                    "RECOMMENDED ACTION: Validate through a controlled pilot.\n"
                    "EXPLANATION: The model is weak, so do not operationalize this signal."
                )
            })()

    monkeypatch.setattr(scenarios, "get_llm", lambda: EvidenceLLM())
    result = await scenarios.explain_scenario(
        {
            "data_scope": {
                "dataset_rows_profiled": 603,
                "rows_scanned": 600,
                "rows_evaluated": 600,
                "sampled": False,
            },
            "impact": {"changed_prediction_count": 16},
        },
        {"quality": {"verdict": "weak"}},
    )

    assert result["recommendation"] == "Validate through a controlled pilot."
    assert result["explanation"] == "The model is weak, so do not operationalize this signal."
