"""PDF report tests. Deterministic -- no LLM."""
import pytest
from pypdf import PdfReader

from app.services.report import build_report

RUN = {
    "plan": {"target_column": "churn", "task_type": "classification",
             "rationale": "Binary outcome."},
    "summary": "A random forest predicted churn with an F1 of 0.62.",
    "training": {
        "task_type": "classification", "target_column": "churn",
        "n_train": 482, "n_test": 121,
        "features_used": ["tenure", "charges"],
        "features_dropped": [{"column": "id", "reason": "identifier"}],
        "leaked_features": [],
        "best_model": "random_forest",
    },
    "explanation": {
        "method": "shap", "model_name": "random_forest", "rows_explained": 121,
        "features": [
            {"feature": "tenure", "importance": 0.0835, "rank": 1, "encoded_parts": 1},
            {"feature": "charges", "importance": 0.0537, "rank": 2, "encoded_parts": 1},
        ],
        "note": "Mean absolute SHAP value.",
    },
    "quality": {
        "verdict": "weak", "primary_metric": "f1", "primary_value": 0.62,
        "gate_metric": "roc_auc", "gate_value": 0.58,
        "reasons": ["ROC-AUC 0.5800 is below 0.65; barely separates classes."],
        "dead_features": ["support_tickets"], "suggestions": [],
        "checks": [
            {"name": "class_separation", "passed": False,
             "detail": "ROC-AUC 0.5800 is below 0.65; barely separates classes."},
            {"name": "sample_size", "passed": True,
             "detail": "482 training rows is sufficient; sample size is NOT a problem."},
        ],
    },
    "cleaning": {"rows_before": 603, "rows_after": 600, "columns_before": 11,
                 "columns_after": 11, "changed": True,
                 "actions": [{"action": "drop_duplicate_rows",
                              "detail": "Identical rows overstate every score.",
                              "rows_affected": 3, "columns": []}]},
    "attempts": [{"round": 0, "target_column": "churn", "task_type": "classification",
                  "excluded_features": [], "best_model": "random_forest",
                  "primary_metric": "f1", "primary_metric_value": 0.62,
                  "gate_metric": "roc_auc", "gate_value": 0.58}],
    "reflection": {"action": "accept", "reasoning": "Reached the retry limit."},
}

EXPERIMENTS = [
    {"model_name": "logistic_regression", "primary_metric": "f1",
     "primary_metric_value": 0.5749, "train_seconds": 0.2, "is_selected": False},
    {"model_name": "random_forest", "primary_metric": "f1",
     "primary_metric_value": 0.6201, "train_seconds": 0.96, "is_selected": True},
]


def _text(pdf: bytes) -> str:
    import io
    return "\n".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf)).pages)


def test_produces_a_valid_multipage_pdf():
    pdf = build_report("Churn", RUN, EXPERIMENTS)
    assert pdf.startswith(b"%PDF")
    import io
    assert len(PdfReader(io.BytesIO(pdf)).pages) >= 2


def test_verdict_appears_before_any_metric():
    """A report that buries its caveats behind its numbers lends unearned
    confidence. The verdict is stated first, deliberately."""
    text = _text(build_report("Churn", RUN, EXPERIMENTS))
    assert text.index("WEAK") < text.index("0.62")


def test_weak_verdict_carries_an_explicit_warning():
    text = _text(build_report("Churn", RUN, EXPERIMENTS))
    assert "not reliable enough" in text


def test_all_sections_present():
    text = _text(build_report("Churn", RUN, EXPERIMENTS))
    for section in ("SUMMARY", "WHAT DROVE THE PREDICTIONS",
                    "HOW FAR TO TRUST THIS", "HOW THIS WAS PRODUCED",
                    "WHAT-IF SCENARIO ANALYSIS",
                    "LIMITS OF THIS ANALYSIS"):
        assert section in text, f"missing {section}"


def test_no_scenario_is_reported_without_inventing_results():
    text = _text(build_report("Churn", RUN, EXPERIMENTS))

    assert "WHAT-IF SCENARIO ANALYSIS" in text
    assert "No What-if scenario has been run" in text


def test_classification_scenario_reports_saved_calculated_values():
    scenario = {
        "task_type": "classification",
        "feature_change": {
            "feature": "tenure",
            "operation": "increase_percent",
            "requested_value": 10,
            "rows_changed": 121,
            "changed_rate_percent": 100.0,
            "baseline": {"kind": "numeric", "mean": 24.5},
            "scenario": {"kind": "numeric", "mean": 26.95},
        },
        "data_scope": {
            "rows_scanned": 121,
            "rows_evaluated": 121,
            "sampled": False,
            "row_read_limit_reached": False,
            "row_read_limit": 100000,
        },
        "baseline_result": {
            "predicted_class_distribution": [
                {"class": 0, "count": 80, "rate_percent": 66.116},
                {"class": 1, "count": 41, "rate_percent": 33.884},
            ],
        },
        "scenario_result": {
            "predicted_class_distribution": [
                {"class": 0, "count": 85, "rate_percent": 70.248},
                {"class": 1, "count": 36, "rate_percent": 29.752},
            ],
        },
        "impact": {
            "focus_class": 1,
            "baseline_focus_class_rate_percent": 33.884,
            "scenario_focus_class_rate_percent": 29.752,
            "absolute_change_percentage_points": -4.132,
            "percentage_change": -12.194,
            "changed_prediction_count": 5,
            "changed_prediction_rate_percent": 4.132,
            "class_distribution_changes": [
                {"class": 0, "absolute_change_percentage_points": 4.132,
                 "percentage_change": 6.25},
                {"class": 1, "absolute_change_percentage_points": -4.132,
                 "percentage_change": -12.194},
            ],
        },
        "ai_recommendation": "Validate with a controlled pilot.",
        "ai_explanation": "The recommendation is interpretation of model sensitivity.",
    }
    run = {**RUN, "latest_scenario": scenario}
    text = _text(build_report("Churn", run, EXPERIMENTS))

    assert "tenure increased by 10%" in text
    assert "33.88%" in text
    assert "29.75%" in text
    assert "5 of 121 evaluated rows" in text
    assert "WHAT-IF SCENARIO ANALYSIS" in text
    assert "AI INTERPRETATION (NOT A CALCULATED RESULT)" in text
    assert "Validate with a controlled pilot." in text


def test_regression_scenario_reports_absolute_and_percentage_change():
    scenario = {
        "task_type": "regression",
        "feature_change": {
            "feature": "tenure",
            "operation": "add",
            "requested_value": 2,
            "rows_changed": 121,
            "changed_rate_percent": 100.0,
            "baseline": {"kind": "numeric", "mean": 24.5},
            "scenario": {"kind": "numeric", "mean": 26.5},
        },
        "data_scope": {"rows_evaluated": 121, "sampled": False},
        "baseline_result": {"mean_prediction": 4.0, "median_prediction": 3.9},
        "scenario_result": {"mean_prediction": 6.0, "median_prediction": 5.9},
        "impact": {
            "absolute_change": 2.0,
            "percentage_change": 50.0,
            "changed_prediction_count": 121,
            "changed_prediction_rate_percent": 100.0,
        },
    }
    text = _text(build_report(
        "Regression", {**RUN, "latest_scenario": scenario}, EXPERIMENTS
    ))

    assert "Mean" in text
    assert "Absolute change in mean prediction: 2.000000" in text
    assert "percentage change: 50.000%" in text


def test_leakage_is_reported_prominently():
    run = {**RUN, "training": {**RUN["training"], "leaked_features": [
        {"column": "alive", "score": 1.0, "reason": "it restates the answer"},
    ]}}
    text = _text(build_report("Titanic", run, EXPERIMENTS))
    assert "COLUMNS REMOVED BEFORE MODELLING" in text
    assert "alive" in text
    assert text.index("alive") < text.index("HOW THIS WAS PRODUCED")


def test_sampling_is_disclosed_in_limits():
    run = {**RUN, "training": {**RUN["training"], "sampled_from": 53940}}
    assert "53,940" in _text(build_report("Diamonds", run, EXPERIMENTS))


def test_strong_verdict_changes_the_wording():
    run = {**RUN, "quality": {**RUN["quality"], "verdict": "strong"}}
    text = _text(build_report("Churn", run, EXPERIMENTS))
    assert "STRONG" in text and "reliable enough to act on" in text


def test_survives_a_minimal_run():
    """A failed or partial run must still render rather than raising."""
    pdf = build_report("Empty", {"quality": {"verdict": "weak"}}, [])
    assert pdf.startswith(b"%PDF")


@pytest.mark.parametrize("field", ["explanation", "cleaning", "attempts", "reflection"])
def test_missing_optional_sections_are_skipped(field):
    run = {k: v for k, v in RUN.items() if k != field}
    assert build_report("Churn", run, EXPERIMENTS).startswith(b"%PDF")


def test_handled_findings_are_not_labelled_as_failures():
    """A non-gating check that did not pass found something and it was handled.

    The Titanic report read `target leakage | fail | Removed before training`,
    which makes a good outcome look like a bad one to anyone skimming.
    """
    run = {**RUN, "quality": {**RUN["quality"], "checks": [
        {"name": "class_separation", "passed": False, "gating": True,
         "detail": "ROC-AUC 0.58 is below 0.65."},
        {"name": "target_leakage", "passed": False, "gating": False,
         "detail": "Removed before training: alive."},
        {"name": "sample_size", "passed": True, "gating": True,
         "detail": "627 rows is sufficient."},
    ]}}
    text = _text(build_report("Titanic", run, EXPERIMENTS))

    assert "found" in text      # the handled finding
    assert "fail" in text       # the genuine gate failure
