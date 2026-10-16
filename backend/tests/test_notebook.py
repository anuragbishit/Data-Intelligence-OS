"""Tests for Jupyter Notebook generation service."""
import json
from app.services.notebook import generate_analysis_notebook


def test_generate_analysis_notebook():
    payload = {
        "plan": {
            "target_column": "churn",
        },
        "training": {
            "task_type": "classification",
            "best_model": "random_forest",
            "primary_metric": "f1_weighted",
            "primary_metric_value": 0.8954,
            "features_used": ["tenure", "monthly_charges", "contract"],
        },
        "cleaning": {
            "rows_before": 1000,
            "rows_after": 980,
            "actions": [{"action": "drop_duplicate_rows", "rows_affected": 20}],
        },
        "explanation": {
            "features": [
                {"feature": "monthly_charges", "importance": 0.45},
                {"feature": "tenure", "importance": 0.35},
            ]
        },
    }

    nb = generate_analysis_notebook(
        project_name="Customer Retention",
        run_id="run-456",
        dataset_name="churn.csv",
        output_payload=payload,
    )

    assert nb["nbformat"] == 4
    assert nb["nbformat_minor"] == 5
    assert len(nb["cells"]) > 5

    # Test JSON serialization
    serialized = json.dumps(nb)
    assert "Customer Retention" in serialized
    assert "random_forest" in serialized
    assert "monthly_charges" in serialized

    # Check cell structure
    for cell in nb["cells"]:
        assert "cell_type" in cell
        assert "source" in cell
        assert isinstance(cell["source"], list)
