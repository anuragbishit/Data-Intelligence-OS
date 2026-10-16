"""Tests for Exploratory Data Analysis (EDA) service."""
import json
import numpy as np
import pandas as pd
from app.services.eda import calculate_eda


def test_calculate_eda(tmp_path):
    rng = np.random.default_rng(42)
    n = 150
    df = pd.DataFrame({
        "age": rng.normal(30, 5, n),
        "score": rng.normal(80, 10, n),
        "category": rng.choice(["Alpha", "Beta", "Gamma"], n),
        "with_nulls": [None if i % 10 == 0 else float(i) for i in range(n)],
    })

    csv_path = tmp_path / "sample.csv"
    df.to_csv(csv_path, index=False)

    eda = calculate_eda(csv_path)

    assert eda["rows"] == 150
    assert eda["columns"] == 4
    assert len(eda["missingness"]) == 4

    # Check null count on with_nulls
    null_col = next(m for m in eda["missingness"] if m["column"] == "with_nulls")
    assert null_col["missing_count"] == 15
    assert null_col["missing_pct"] == 10.0

    # Check correlation matrix
    assert "age" in eda["correlation_columns"]
    assert "score" in eda["correlation_columns"]
    assert len(eda["correlation_matrix"]) >= 4

    # Check distributions
    assert "age" in eda["distributions"]
    age_dist = eda["distributions"]["age"]
    assert age_dist["type"] == "numeric"
    assert len(age_dist["bins"]) > 0
    assert "mean" in age_dist
    assert "median" in age_dist

    cat_dist = eda["distributions"]["category"]
    assert cat_dist["type"] == "categorical"
    assert len(cat_dist["categories"]) == 3
    cat_names = {c["name"] for c in cat_dist["categories"]}
    assert "Alpha" in cat_names

    # JSON serializability check
    json.dumps(eda)
