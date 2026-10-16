"""Live Single-Record Prediction service.

Allows testing individual inputs against the trained Scikit-Learn pipeline
and returns predictions, class probability distributions, and local feature contributions.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.core.logging import get_logger
from app.services import artifacts

logger = get_logger(__name__)


def build_prediction_schema(output_payload: dict, dataset_profile: dict | None) -> dict:
    training = output_payload.get("training") or {}
    plan = output_payload.get("plan") or {}
    target_column = plan.get("target_column") or "target"
    task_type = training.get("task_type") or "classification"

    features_used = training.get("features_used") or []
    numeric_cols = set(training.get("numeric_columns") or [])
    categorical_cols = set(training.get("categorical_columns") or [])

    col_profiles = {c["name"]: c for c in (dataset_profile or {}).get("columns", [])}

    items = []
    for f in features_used:
        c_prof = col_profiles.get(f, {})
        sem = c_prof.get("semantic_type", "")
        stats = c_prof.get("stats", {})
        is_num = f in numeric_cols or sem in {"numeric", "float", "integer"} or stats.get("mean") is not None

        if is_num:
            mean_val = stats.get("mean")
            median_val = stats.get("median", mean_val)
            min_val = stats.get("min", 0.0)
            max_val = stats.get("max", 100.0)
            default_val = median_val if median_val is not None else (min_val + max_val) / 2
            if default_val is not None and isinstance(default_val, (float, np.floating)):
                default_val = round(float(default_val), 3)

            val_range = (max_val - min_val) if (max_val is not None and min_val is not None) else 10.0
            step = 1.0 if val_range > 50 and isinstance(min_val, int) else round(max(val_range / 100.0, 0.01), 3)

            items.append({
                "name": f,
                "type": "numeric",
                "default_value": default_val if default_val is not None else 0.0,
                "min_value": float(min_val) if min_val is not None else None,
                "max_value": float(max_val) if max_val is not None else None,
                "step": step,
                "options": None,
            })
        else:
            top_vals = [str(item["value"]) for item in c_prof.get("top_values", []) if item.get("value") is not None]
            sample_vals = [str(v) for v in c_prof.get("sample_values", []) if v is not None]
            options = top_vals or sample_vals or ["Default"]
            default_val = options[0] if options else ""

            items.append({
                "name": f,
                "type": "categorical",
                "default_value": default_val,
                "min_value": None,
                "max_value": None,
                "step": None,
                "options": options,
            })

    return {
        "target_column": target_column,
        "task_type": task_type,
        "features": items,
    }


def predict_single(
    model_path: str,
    output_payload: dict,
    features: dict[str, Any],
    dataset_profile: dict | None = None,
) -> dict:
    pipeline = artifacts.load_model(model_path)
    training = output_payload.get("training") or {}
    plan = output_payload.get("plan") or {}
    target_column = plan.get("target_column") or "target"
    task_type = training.get("task_type") or "classification"
    features_used = training.get("features_used") or list(features.keys())
    explanation = output_payload.get("explanation") or {}
    global_importance_map = {
        item["feature"]: item["importance"] for item in explanation.get("features", [])
    }

    schema = build_prediction_schema(output_payload, dataset_profile)
    feature_defaults = {item["name"]: item["default_value"] for item in schema["features"]}
    numeric_feature_names = {item["name"] for item in schema["features"] if item["type"] == "numeric"}

    row_data = {}
    for f in features_used:
        if f in features and features[f] is not None and str(features[f]).strip() != "":
            val = features[f]
            if f in numeric_feature_names:
                try:
                    row_data[f] = float(val)
                except (ValueError, TypeError):
                    row_data[f] = feature_defaults.get(f, 0.0)
            else:
                row_data[f] = str(val)
        else:
            row_data[f] = feature_defaults.get(f, 0.0 if f in numeric_feature_names else "")

    df = pd.DataFrame([row_data])

    raw_pred = pipeline.predict(df)[0]
    if isinstance(raw_pred, (np.integer, int)):
        pred_val = int(raw_pred)
    elif isinstance(raw_pred, (np.floating, float)):
        pred_val = round(float(raw_pred), 4)
    else:
        pred_val = str(raw_pred)

    display_pred = str(pred_val)
    if task_type == "regression" and isinstance(pred_val, (int, float)):
        display_pred = f"{pred_val:,.2f}"

    probabilities = None
    confidence = None
    if task_type == "classification" and hasattr(pipeline, "predict_proba"):
        try:
            probs = pipeline.predict_proba(df)[0]
            classes = getattr(pipeline, "classes_", None)
            if classes is None:
                inner = getattr(pipeline, "named_steps", {}).get("model")
                classes = getattr(inner, "classes_", range(len(probs)))

            prob_list = []
            for c, p in zip(classes, probs):
                p_float = float(p)
                prob_list.append({
                    "class_name": str(c),
                    "probability": round(p_float, 4),
                    "percentage": round(p_float * 100, 1),
                })
            prob_list.sort(key=lambda x: x["probability"], reverse=True)
            probabilities = prob_list
            confidence = prob_list[0]["probability"] if prob_list else None
        except Exception as exc:
            logger.warning("predict_proba failed", extra={"error": str(exc)})

    # Local feature contributions
    contributions = []
    for f in features_used:
        curr_val = row_data[f]
        default_val = feature_defaults.get(f)
        weight = global_importance_map.get(f, 0.1)

        if f in numeric_feature_names:
            col_spec = next((item for item in schema["features"] if item["name"] == f), None)
            min_v = col_spec["min_value"] if col_spec and col_spec["min_value"] is not None else 0.0
            max_v = col_spec["max_value"] if col_spec and col_spec["max_value"] is not None else 100.0
            span = max(max_v - min_v, 1e-6)
            deviation = (float(curr_val) - float(default_val if default_val is not None else 0.0)) / span
            local_impact = deviation * weight
        else:
            is_different = str(curr_val) != str(default_val)
            local_impact = (0.5 * weight) if is_different else 0.0

        direction = "positive" if local_impact > 0.001 else "negative" if local_impact < -0.001 else "neutral"
        contributions.append({
            "feature": f,
            "value": curr_val,
            "baseline_value": default_val,
            "contribution": round(abs(local_impact), 4),
            "direction": direction,
        })

    contributions.sort(key=lambda x: x["contribution"], reverse=True)

    return {
        "target_column": target_column,
        "task_type": task_type,
        "prediction": pred_val,
        "prediction_display": display_pred,
        "confidence": confidence,
        "probabilities": probabilities,
        "feature_contributions": contributions,
    }
