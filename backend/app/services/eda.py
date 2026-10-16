"""Exploratory Data Analysis (EDA) service.

Computes correlation matrices, column-wise distribution histograms,
and missingness profiles for interactive visualization.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.core.logging import get_logger
from app.services.profiling import _py, load_dataframe

logger = get_logger(__name__)

MAX_EDA_ROWS = 50_000
MAX_CORR_COLUMNS = 15


def calculate_eda(path: Path) -> dict[str, Any]:
    """Compute comprehensive EDA metrics for a dataset."""
    df, parse_info = load_dataframe(path, max_rows=MAX_EDA_ROWS)
    n_rows = len(df)
    n_cols = len(df.columns)

    # 1. Missingness breakdown
    missingness = []
    for col in df.columns:
        n_null = int(df[col].isna().sum())
        pct_null = round((n_null / n_rows) * 100, 2) if n_rows else 0.0
        missingness.append({
            "column": col,
            "missing_count": n_null,
            "missing_pct": pct_null,
            "present_pct": round(100.0 - pct_null, 2),
            "dtype": str(df[col].dtype),
        })
    missingness.sort(key=lambda x: x["missing_count"], reverse=True)

    # 2. Correlation Matrix
    numeric_df = df.select_dtypes(include=[np.number])
    # Exclude columns with zero variance
    valid_numeric_cols = [c for c in numeric_df.columns if numeric_df[c].nunique() > 1]
    valid_numeric_cols = valid_numeric_cols[:MAX_CORR_COLUMNS]

    correlation_matrix = []
    correlation_columns = valid_numeric_cols
    if len(valid_numeric_cols) >= 2:
        corr = numeric_df[valid_numeric_cols].corr(method="pearson").fillna(0.0)
        for i, row_col in enumerate(valid_numeric_cols):
            for j, col_col in enumerate(valid_numeric_cols):
                val = float(corr.iloc[i, j])
                if math.isnan(val) or math.isinf(val):
                    val = 0.0
                correlation_matrix.append({
                    "x": col_col,
                    "y": row_col,
                    "correlation": round(val, 3),
                })

    # 3. Distributions
    distributions = {}
    for col in df.columns:
        series = df[col].dropna()
        if series.empty:
            continue

        if pd.api.types.is_numeric_dtype(df[col]) and series.nunique() > 2:
            # Numeric histogram
            vals = series.values.astype(float)
            vals = vals[~np.isnan(vals)]
            if len(vals) > 0:
                min_v = float(np.min(vals))
                max_v = float(np.max(vals))
                mean_v = float(np.mean(vals))
                median_v = float(np.median(vals))
                std_v = float(np.std(vals))

                # Compute bins
                n_bins = min(12, max(4, series.nunique()))
                if min_v == max_v:
                    bins_data = [{
                        "bin_start": min_v,
                        "bin_end": max_v,
                        "count": len(vals),
                        "label": f"{min_v:.2f}",
                    }]
                else:
                    counts, bin_edges = np.histogram(vals, bins=n_bins)
                    bins_data = []
                    for idx, cnt in enumerate(counts):
                        b_start = float(bin_edges[idx])
                        b_end = float(bin_edges[idx + 1])
                        bins_data.append({
                            "bin_start": round(b_start, 2),
                            "bin_end": round(b_end, 2),
                            "count": int(cnt),
                            "label": f"{b_start:.1f} to {b_end:.1f}",
                        })

                distributions[col] = {
                    "type": "numeric",
                    "bins": bins_data,
                    "min": round(min_v, 3),
                    "max": round(max_v, 3),
                    "mean": round(mean_v, 3),
                    "median": round(median_v, 3),
                    "std": round(std_v, 3),
                    "total_count": len(vals),
                }
        else:
            # Categorical frequency
            top = series.value_counts().head(12)
            cat_data = [
                {
                    "name": str(_py(k))[:30],
                    "count": int(v),
                    "pct": round((int(v) / n_rows) * 100, 1) if n_rows else 0.0,
                }
                for k, v in top.items()
            ]
            distributions[col] = {
                "type": "categorical",
                "categories": cat_data,
                "total_unique": int(series.nunique()),
                "total_count": len(series),
            }

    return {
        "rows": n_rows,
        "columns": n_cols,
        "sampled": parse_info.sampled,
        "missingness": missingness,
        "correlation_columns": correlation_columns,
        "correlation_matrix": correlation_matrix,
        "distributions": distributions,
    }
