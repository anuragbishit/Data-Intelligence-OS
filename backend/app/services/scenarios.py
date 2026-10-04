"""Model-backed what-if predictions using an existing analysis artifact."""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import anyio
import numpy as np
import pandas as pd

from app.core.llm import get_llm, message_text
from app.core.logging import get_logger
from app.services import artifacts
from app.services.training import (
    INTERACTIVE_ROW_LIMIT,
    MAX_TRAINING_ROWS,
    RANDOM_STATE,
)

logger = get_logger(__name__)

_NUMERIC_OPERATIONS = {
    "increase_percent",
    "decrease_percent",
    "add",
    "subtract",
    "multiply",
    "divide",
}


def _number(value: float | str) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("This operation requires a numeric value.") from exc
    if not math.isfinite(result):
        raise ValueError("Scenario value must be a finite number.")
    return result


def _native(value: Any) -> Any:
    if isinstance(value, np.generic):
        value = value.item()
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _rounded(value: float | None) -> float | None:
    return round(float(value), 6) if value is not None and math.isfinite(value) else None


def _feature_summary(series: pd.Series) -> dict[str, Any]:
    missing_count = int(series.isna().sum())
    if pd.api.types.is_numeric_dtype(series):
        values = pd.to_numeric(series, errors="coerce").dropna()
        return {
            "kind": "numeric",
            "mean": _rounded(values.mean()) if not values.empty else None,
            "minimum": _rounded(values.min()) if not values.empty else None,
            "maximum": _rounded(values.max()) if not values.empty else None,
            "missing_count": missing_count,
        }

    top_values = series.value_counts(dropna=False).head(8)
    return {
        "kind": "categorical",
        "top_values": [
            {"value": _native(value), "count": int(count)}
            for value, count in top_values.items()
        ],
        "missing_count": missing_count,
    }


def apply_feature_change(
    frame: pd.DataFrame,
    feature: str,
    operation: str,
    value: float | str,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Return a changed copy plus measured before/after feature evidence."""
    if feature not in frame.columns:
        raise ValueError(f"Feature '{feature}' is not present in the dataset.")

    baseline_values = frame[feature].copy()
    changed_frame = frame.copy(deep=True)
    numeric_feature = pd.api.types.is_numeric_dtype(baseline_values)

    if operation == "set":
        if pd.api.types.is_bool_dtype(baseline_values):
            bool_value = str(value).strip().lower()
            if bool_value not in {"true", "false", "1", "0", "yes", "no"}:
                raise ValueError("A boolean feature can only be set to true or false.")
            changed_value = bool_value in {"true", "1", "yes"}
        elif numeric_feature:
            changed_value: float | str = _number(value)
        else:
            changed_value = str(value)
        changed_frame[feature] = changed_value
    else:
        if operation not in _NUMERIC_OPERATIONS:
            raise ValueError(f"Unsupported scenario operation '{operation}'.")
        if not numeric_feature:
            raise ValueError(
                f"Operation '{operation}' requires a numeric feature; use 'set' for categories."
            )
        amount = _number(value)
        if operation in {"increase_percent", "decrease_percent"} and amount < 0:
            raise ValueError("Percentage values must be zero or greater.")
        if operation == "decrease_percent" and amount > 100:
            raise ValueError("A percentage decrease cannot exceed 100%.")
        if operation == "increase_percent":
            changed_frame[feature] = baseline_values * (1 + amount / 100)
        elif operation == "decrease_percent":
            changed_frame[feature] = baseline_values * (1 - amount / 100)
        elif operation == "add":
            changed_frame[feature] = baseline_values + amount
        elif operation == "subtract":
            changed_frame[feature] = baseline_values - amount
        elif operation == "multiply":
            changed_frame[feature] = baseline_values * amount
        elif operation == "divide":
            if amount == 0:
                raise ValueError("A feature cannot be divided by zero.")
            changed_frame[feature] = baseline_values / amount
        changed_value = amount

    after_values = changed_frame[feature]
    changed_mask = (
        baseline_values.ne(after_values)
        & ~(baseline_values.isna() & after_values.isna())
    ).fillna(True)
    changed_count = int(changed_mask.sum())
    row_count = len(frame)
    unseen_category = (
        operation == "set"
        and not numeric_feature
        and changed_value not in set(baseline_values.dropna().unique())
    )

    evidence = {
        "feature": feature,
        "operation": operation,
        "requested_value": _native(changed_value),
        "rows_changed": changed_count,
        "changed_rate_percent": round(changed_count / row_count * 100, 3) if row_count else 0.0,
        "baseline": _feature_summary(baseline_values),
        "scenario": _feature_summary(after_values),
        "unseen_category": bool(unseen_category),
    }
    return changed_frame, evidence


def _distribution(predictions: np.ndarray, classes: list[Any]) -> list[dict[str, Any]]:
    count = len(predictions)
    return [
        {
            "class": _native(label),
            "count": int(np.count_nonzero(predictions == label)),
            "rate_percent": round(float(np.count_nonzero(predictions == label)) / count * 100, 3)
            if count else 0.0,
        }
        for label in classes
    ]


def evaluate_scenario(
    model_path: str,
    dataset_path: Path,
    features: list[str],
    task_type: str,
    feature: str,
    operation: str,
    value: float | str,
    dataset_rows: int | None = None,
) -> dict[str, Any]:
    """Run baseline and modified rows through the saved model, without mutation."""
    if not features or feature not in features:
        raise ValueError("Choose a feature used by this run's trained model.")

    frame = pd.read_csv(dataset_path, nrows=MAX_TRAINING_ROWS)
    if frame.empty:
        raise ValueError("The dataset has no rows to evaluate.")
    missing_features = sorted(set(features) - set(frame.columns))
    if missing_features:
        raise ValueError(
            "The dataset is missing model features: " + ", ".join(missing_features)
        )

    rows_scanned = len(frame)
    read_limit_reached = rows_scanned >= MAX_TRAINING_ROWS
    if rows_scanned > INTERACTIVE_ROW_LIMIT:
        frame = frame.sample(INTERACTIVE_ROW_LIMIT, random_state=RANDOM_STATE)

    baseline_input = frame.loc[:, features].copy()
    scenario_input, feature_evidence = apply_feature_change(
        baseline_input, feature, operation, value
    )
    model = artifacts.load_model(model_path)
    baseline_predictions = np.asarray(model.predict(baseline_input))
    scenario_predictions = np.asarray(model.predict(scenario_input))
    evaluated_rows = len(baseline_predictions)
    changed_predictions = int(np.count_nonzero(baseline_predictions != scenario_predictions))
    changed_rate = round(changed_predictions / evaluated_rows * 100, 3) if evaluated_rows else 0.0

    result: dict[str, Any] = {
        "task_type": task_type,
        "feature_change": feature_evidence,
        "data_scope": {
            "dataset_rows_profiled": dataset_rows,
            "rows_scanned": rows_scanned,
            "rows_evaluated": evaluated_rows,
            "sampled": evaluated_rows < rows_scanned,
            "row_read_limit_reached": read_limit_reached,
            "row_read_limit": MAX_TRAINING_ROWS,
        },
    }

    if task_type == "classification":
        model_classes = getattr(model, "classes_", None)
        if model_classes is None:
            model_classes = getattr(model.named_steps.get("model"), "classes_", [])
        classes = list(model_classes)
        if not classes:
            classes = list(np.unique(np.concatenate((baseline_predictions, scenario_predictions))))
        baseline_distribution = _distribution(baseline_predictions, classes)
        scenario_distribution = _distribution(scenario_predictions, classes)
        class_changes = [
            {
                "class": _native(base["class"]),
                "baseline_rate_percent": base["rate_percent"],
                "scenario_rate_percent": changed["rate_percent"],
                "absolute_change_percentage_points": round(
                    changed["rate_percent"] - base["rate_percent"], 3
                ),
                "percentage_change": round(
                    (changed["rate_percent"] - base["rate_percent"])
                    / base["rate_percent"] * 100,
                    3,
                ) if base["rate_percent"] else None,
            }
            for base, changed in zip(baseline_distribution, scenario_distribution, strict=True)
        ]
        positive_labels = {"1", "true", "yes", "y", "positive", "churn", "returned"}
        focus_class = next(
            (label for label in classes if str(label).lower() in positive_labels),
            classes[-1] if len(classes) == 2 else None,
        )
        focus_change = next(
            (item for item in class_changes if item["class"] == _native(focus_class)),
            None,
        )
        baseline_result: dict[str, Any] = {
            "rows_evaluated": evaluated_rows,
            "predicted_class_distribution": baseline_distribution,
        }
        scenario_result: dict[str, Any] = {
            "rows_evaluated": evaluated_rows,
            "predicted_class_distribution": scenario_distribution,
        }
        if hasattr(model, "predict_proba"):
            baseline_probabilities = np.asarray(model.predict_proba(baseline_input))
            scenario_probabilities = np.asarray(model.predict_proba(scenario_input))
            baseline_result["mean_probability_by_class"] = [
                {"class": _native(label), "probability_percent": round(float(baseline_probabilities[:, index].mean()) * 100, 3)}
                for index, label in enumerate(classes)
            ]
            scenario_result["mean_probability_by_class"] = [
                {"class": _native(label), "probability_percent": round(float(scenario_probabilities[:, index].mean()) * 100, 3)}
                for index, label in enumerate(classes)
            ]

        result["baseline_result"] = baseline_result
        result["scenario_result"] = scenario_result
        result["impact"] = {
            "changed_prediction_count": changed_predictions,
            "changed_prediction_rate_percent": changed_rate,
            "focus_class": _native(focus_class),
            "baseline_focus_class_rate_percent": focus_change["baseline_rate_percent"] if focus_change else None,
            "scenario_focus_class_rate_percent": focus_change["scenario_rate_percent"] if focus_change else None,
            "absolute_change_percentage_points": focus_change["absolute_change_percentage_points"] if focus_change else None,
            "percentage_change": focus_change["percentage_change"] if focus_change else None,
            "class_distribution_changes": class_changes,
        }
    elif task_type == "regression":
        baseline_values = baseline_predictions.astype(float)
        scenario_values = scenario_predictions.astype(float)
        baseline_mean = float(baseline_values.mean())
        scenario_mean = float(scenario_values.mean())
        absolute_change = scenario_mean - baseline_mean
        result["baseline_result"] = {
            "rows_evaluated": evaluated_rows,
            "mean_prediction": round(baseline_mean, 6),
            "median_prediction": round(float(np.median(baseline_values)), 6),
            "minimum_prediction": round(float(baseline_values.min()), 6),
            "maximum_prediction": round(float(baseline_values.max()), 6),
        }
        result["scenario_result"] = {
            "rows_evaluated": evaluated_rows,
            "mean_prediction": round(scenario_mean, 6),
            "median_prediction": round(float(np.median(scenario_values)), 6),
            "minimum_prediction": round(float(scenario_values.min()), 6),
            "maximum_prediction": round(float(scenario_values.max()), 6),
        }
        result["impact"] = {
            "absolute_change": round(absolute_change, 6),
            "percentage_change": round(absolute_change / baseline_mean * 100, 3)
            if baseline_mean else None,
            "changed_prediction_count": changed_predictions,
            "changed_prediction_rate_percent": changed_rate,
        }
    else:
        raise ValueError(f"Unsupported task type '{task_type}'.")

    return result


async def explain_scenario(
    result: dict[str, Any], decision_context: dict[str, Any] | None = None
) -> dict[str, str | None]:
    """Explain measured scenario results and propose one evidence-grounded action."""
    instructions = (
        "You are writing a decision-support note from calculated model evidence. "
        "Use only facts in the supplied evidence. Do not invent numbers, features, "
        "causes, or certainty. Do not repeat numeric values or row counts; the UI "
        "shows those directly from calculations. A scenario is model sensitivity, "
        "not proof of a real-world causal effect. If model quality is weak or data "
        "risks exist, recommend validation or a controlled experiment before action. "
        "Return exactly two sections using these labels on their own lines:\n"
        "RECOMMENDED ACTION: one cautious, practical next step supported by evidence.\n"
        "EXPLANATION: what was observed, why it matters, and the main risk in 2-4 sentences. "
        "Mention the evaluated row count and sampling when present."
    )
    try:
        scenario_evidence = {
            key: value
            for key, value in result.items()
            if key not in {"ai_explanation", "ai_recommendation"}
        }
        if "data_scope" in scenario_evidence:
            scope = scenario_evidence["data_scope"]
            scenario_evidence["data_scope"] = {
                key: scope.get(key)
                for key in (
                    "rows_scanned",
                    "rows_evaluated",
                    "sampled",
                    "row_read_limit_reached",
                    "row_read_limit",
                )
            }
        response = await get_llm().ainvoke([
            ("system", instructions),
            ("human", str({
                "analysis_evidence": decision_context or {},
                "scenario_results": scenario_evidence,
            })),
        ])
        text = message_text(response).strip()
        sections: dict[str, list[str]] = {"recommendation": [], "explanation": []}
        current: str | None = None
        for line in text.splitlines():
            if line.strip().upper().startswith("RECOMMENDED ACTION:"):
                current = "recommendation"
                sections[current].append(line.split(":", 1)[1].strip())
            elif line.strip().upper().startswith("EXPLANATION:"):
                current = "explanation"
                sections[current].append(line.split(":", 1)[1].strip())
            elif current:
                sections[current].append(line.strip())

        recommendation = " ".join(part for part in sections["recommendation"] if part) or None
        explanation = " ".join(part for part in sections["explanation"] if part) or (text or None)
        return {"recommendation": recommendation, "explanation": explanation}
    except Exception as exc:
        logger.warning("What-if explanation failed", extra={"error": str(exc)})
        return {"recommendation": None, "explanation": None}


async def run_scenario(
    model_path: str,
    dataset_path: Path,
    features: list[str],
    task_type: str,
    feature: str,
    operation: str,
    value: float | str,
    dataset_rows: int | None = None,
    decision_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    result = await anyio.to_thread.run_sync(
        evaluate_scenario,
        model_path,
        dataset_path,
        features,
        task_type,
        feature,
        operation,
        value,
        dataset_rows,
    )
    ai_decision = await explain_scenario(result, decision_context)
    result["ai_explanation"] = ai_decision["explanation"]
    result["ai_recommendation"] = ai_decision["recommendation"]
    return result
