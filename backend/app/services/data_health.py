from __future__ import annotations

from typing import Any


def _clamp(value: float) -> float:
    return max(0.0, min(100.0, value))


def calculate_data_health(profile: dict[str, Any]) -> dict[str, Any]:
    """
    Data Intelligence OS — Data Health Engine.

    Calculates an overall health score from the dataset profile.
    """

    shape = profile.get("shape") or {}
    columns = profile.get("columns") or []
    warnings = profile.get("warnings") or []

    rows = int(shape.get("rows") or 0)
    column_count = int(shape.get("columns") or len(columns))
    duplicate_rows = int(profile.get("duplicate_rows") or 0)

    # Completeness
    if columns:
        missing_rates = [
            float(column.get("null_pct") or 0)
            for column in columns
        ]
        average_missing = sum(missing_rates) / len(missing_rates)
        completeness = _clamp(100.0 - average_missing)
    else:
        completeness = 0.0

    # Uniqueness
    if rows > 0 and columns:
        uniqueness_values = []

        for column in columns:
            unique_count = int(column.get("unique_count") or 0)
            uniqueness_values.append(
                _clamp((unique_count / rows) * 100)
            )

        uniqueness = (
            sum(uniqueness_values) / len(uniqueness_values)
            if uniqueness_values
            else 0.0
        )
    else:
        uniqueness = 0.0

    # Consistency
    duplicate_rate = (
        (duplicate_rows / rows) * 100
        if rows > 0
        else 0.0
    )

    warning_count = len([
        warning
        for warning in warnings
        if warning.get("severity") in {"warning", "error"}
    ])

    error_count = len([
        warning
        for warning in warnings
        if warning.get("severity") == "error"
    ])

    consistency = _clamp(
        100.0
        - min(25.0, duplicate_rate)
        - min(25.0, warning_count * 5.0)
    )

    # Validity
    validity = _clamp(
        100.0
        - min(50.0, error_count * 10.0)
        - min(30.0, warning_count * 3.0)
    )

    # Overall score
    overall_score = round(
        completeness * 0.35
        + validity * 0.25
        + uniqueness * 0.20
        + consistency * 0.20
    )

    # Status
    if overall_score >= 90:
        status = "excellent"
    elif overall_score >= 75:
        status = "healthy"
    elif overall_score >= 60:
        status = "needs_attention"
    else:
        status = "poor"

    # Findings
    findings: list[dict[str, Any]] = []

    if completeness < 90:
        findings.append({
            "type": "completeness",
            "severity": "warning",
            "message": (
                f"Average missing-value rate is "
                f"{100 - completeness:.1f}%."
            ),
        })

    if duplicate_rows > 0:
        findings.append({
            "type": "duplicates",
            "severity": "warning",
            "message": (
                f"{duplicate_rows:,} duplicate row"
                f"{'s' if duplicate_rows != 1 else ''} detected."
            ),
        })

    if error_count > 0:
        findings.append({
            "type": "validity",
            "severity": "error",
            "message": (
                f"{error_count} data-quality error"
                f"{'s' if error_count != 1 else ''} detected."
            ),
        })

    return {
        "score": overall_score,
        "status": status,
        "metrics": {
            "completeness": round(completeness, 2),
            "validity": round(validity, 2),
            "uniqueness": round(uniqueness, 2),
            "consistency": round(consistency, 2),
        },
        "dataset": {
            "rows": rows,
            "columns": column_count,
            "duplicate_rows": duplicate_rows,
        },
        "findings": findings,
    }
