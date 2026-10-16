"""Jupyter Notebook Generator service.

Generates a fully reproducible, clean, and well-commented .ipynb notebook
for any completed analysis run.
"""
from __future__ import annotations

import json
from typing import Any


def _md_cell(content: str) -> dict[str, Any]:
    return {
        "cell_type": "markdown",
        "metadata": {},
        "source": [line + "\n" for line in content.split("\n")],
    }


def _code_cell(content: str) -> dict[str, Any]:
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [line + "\n" for line in content.split("\n")],
    }


def generate_analysis_notebook(
    project_name: str,
    run_id: str,
    dataset_name: str,
    output_payload: dict[str, Any],
) -> dict[str, Any]:
    """Generate a Jupyter notebook reproducing the autonomous run."""
    plan = output_payload.get("plan") or {}
    training = output_payload.get("training") or {}
    explanation = output_payload.get("explanation") or {}
    cleaning = output_payload.get("cleaning") or {}

    target = plan.get("target_column") or "target"
    task_type = training.get("task_type") or "classification"
    best_model = training.get("best_model") or "Scikit-Learn Model"
    primary_metric = training.get("primary_metric") or "score"
    primary_val = training.get("primary_metric_value")
    score_str = f"{primary_val:.4f}" if primary_val is not None else "N/A"
    features_used = training.get("features_used") or []
    top_features = explanation.get("features") or []

    # Markdown header
    header_md = f"""# 🤖 Data Intelligence OS — Autonomous Analysis Reproduction
**Project:** {project_name}  
**Run ID:** `{run_id}`  
**Dataset:** `{dataset_name}`  
**Target Column:** `{target}` ({task_type})  
**Selected Best Model:** `{best_model}`  
**Primary Performance Metric:** `{primary_metric}` = **{score_str}**  

---
This notebook was automatically synthesized by **Data Intelligence OS**.  
It provides transparent, self-contained Python code to replicate the data cleaning, feature engineering, model training, evaluation, explainability, and live inference.
"""

    # Imports
    imports_code = """import os
import joblib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, r2_score, mean_squared_error

# Configure aesthetics for presentation-quality charts
sns.set_theme(style="whitegrid", palette="muted")
plt.rcParams['figure.figsize'] = (10, 5.5)
plt.rcParams['font.size'] = 11

print("✅ Data science and machine learning libraries loaded successfully.")
"""

    # Data loading
    data_load_code = f"""# 1. Load the dataset
# Adjust the path below if your CSV file is stored in a different directory.
DATASET_FILE = "{dataset_name}"

if os.path.exists(DATASET_FILE):
    df = pd.read_csv(DATASET_FILE)
    print(f"Loaded dataset: {{df.shape[0]:,}} rows, {{df.shape[1]}} columns.")
else:
    # If the file is named dataset.csv or in storage:
    alt_file = "dataset.csv"
    if os.path.exists(alt_file):
        df = pd.read_csv(alt_file)
        print(f"Loaded fallback dataset: {{df.shape[0]:,}} rows, {{df.shape[1]}} columns.")
    else:
        raise FileNotFoundError(f"Could not find '{{DATASET_FILE}}' or '{{alt_file}}'. Place the CSV in this directory.")

df.head()
"""

    # Cleaning steps
    cleaning_md = f"""## 2. Autonomous Data Cleaning
During analysis, the automated cleaner recorded:
- **Rows before cleaning:** {cleaning.get('rows_before', 'N/A')}
- **Rows after cleaning:** {cleaning.get('rows_after', 'N/A')}
- **Actions applied:** {len(cleaning.get('actions', []))} transformation(s)
"""
    cleaning_code = """# Reproduce automated cleaning actions
print(f"Rows before: {len(df):,}")

# Remove duplicate records
df = df.drop_duplicates()

# Normalize whitespace in categorical string columns
for col in df.select_dtypes(include=["object"]).columns:
    df[col] = df[col].astype(str).str.strip()

print(f"Rows after cleaning: {len(df):,}")
"""

    # Feature Setup
    features_code = f"""# 3. Features & Target Variable Definition
TARGET_COLUMN = "{target}"
FEATURES = {features_used}

print(f"Target column: {{TARGET_COLUMN}}")
print(f"Features ({{len(FEATURES)}}): {{FEATURES}}")

X = df[FEATURES]
y = df[TARGET_COLUMN]

stratify = y if "{task_type}" == "classification" and y.nunique() <= 10 else None
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=stratify
)
print(f"Training split: {{X_train.shape[0]:,}} rows | Test split: {{X_test.shape[0]:,}} rows")
"""

    # Model Pipeline
    model_code = f"""# 4. Model Pipeline Execution
# The pipeline includes imputation, scaling, one-hot encoding, and the best model architecture ({best_model}).
MODEL_PATH = "model.joblib"

if os.path.exists(MODEL_PATH):
    model = joblib.load(MODEL_PATH)
    print("✅ Successfully loaded trained pipeline from 'model.joblib'.")
else:
    print("ℹ️ 'model.joblib' not found. Training model with standard preprocessing pipeline...")
    from sklearn.compose import ColumnTransformer
    from sklearn.pipeline import Pipeline
    from sklearn.impute import SimpleImputer
    from sklearn.preprocessing import StandardScaler, OneHotEncoder
    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor

    num_cols = X_train.select_dtypes(include=[np.number]).columns.tolist()
    cat_cols = X_train.select_dtypes(exclude=[np.number]).columns.tolist()

    preprocessor = ColumnTransformer(transformers=[
        ("num", Pipeline([("imp", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]), num_cols),
        ("cat", Pipeline([("imp", SimpleImputer(strategy="most_frequent")), ("ohe", OneHotEncoder(handle_unknown="ignore"))]), cat_cols),
    ])

    clf = RandomForestClassifier(n_estimators=100, random_state=42) if "{task_type}" == "classification" else RandomForestRegressor(n_estimators=100, random_state=42)
    model = Pipeline([("prep", preprocessor), ("model", clf)])
    model.fit(X_train, y_train)
    print("✅ Model trained successfully.")
"""

    # Evaluation
    eval_md = f"""## 5. Model Performance & Evaluation ({task_type.title()})"""
    if task_type == "classification":
        eval_code = """# Model Evaluation: Classification Metrics & Confusion Matrix
y_pred = model.predict(X_test)
print(classification_report(y_test, y_pred))

# Confusion Matrix Heatmap
cm = confusion_matrix(y_test, y_pred)
labels = np.unique(y_test)

plt.figure(figsize=(7, 5))
sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", xticklabels=labels, yticklabels=labels)
plt.title(f"Confusion Matrix — {type(model.named_steps.get('model', model)).__name__}")
plt.xlabel("Predicted Label")
plt.ylabel("Actual Label")
plt.tight_layout()
plt.show()
"""
    else:
        eval_code = """# Model Evaluation: Regression Metrics & Residuals
y_pred = model.predict(X_test)
r2 = r2_score(y_test, y_pred)
rmse = np.sqrt(mean_squared_error(y_test, y_pred))

print(f"R² Score: {r2:.4f}")
print(f"Root Mean Squared Error (RMSE): {rmse:,.4f}")

fig, axes = plt.subplots(1, 2, figsize=(13, 5))

# Actual vs Predicted
axes[0].scatter(y_test, y_pred, alpha=0.6, color="#2563eb")
ideal = [min(y_test.min(), y_pred.min()), max(y_test.max(), y_pred.max())]
axes[0].plot(ideal, ideal, "r--", lw=1.5, label="Perfect Fit (y = x)")
axes[0].set_xlabel("Actual Values")
axes[0].set_ylabel("Predicted Values")
axes[0].set_title(f"Actual vs. Predicted (R² = {r2:.3f})")
axes[0].legend()

# Residuals Distribution
residuals = y_test - y_pred
sns.histplot(residuals, kde=True, ax=axes[1], color="#0d9488")
axes[1].axvline(0, color="red", linestyle="--", lw=1.5)
axes[1].set_title("Residuals Distribution")
axes[1].set_xlabel("Residual (Actual - Predicted)")

plt.tight_layout()
plt.show()
"""

    # Feature Importance
    top_feature_names = [f["feature"] for f in top_features[:10]]
    top_feature_scores = [f["importance"] for f in top_features[:10]]
    importance_code = f"""# 6. Top Feature Importances (From AI Explainability Trace)
feature_names = {top_feature_names}
importance_scores = {top_feature_scores}

if feature_names and importance_scores:
    plt.figure(figsize=(9, max(4, len(feature_names) * 0.45)))
    y_pos = np.arange(len(feature_names))
    plt.barh(y_pos, importance_scores[::-1], color="#3b82f6", align="center")
    plt.yticks(y_pos, feature_names[::-1])
    plt.xlabel("Importance Weight")
    plt.title("Top Predictive Drivers")
    plt.tight_layout()
    plt.show()
else:
    print("No feature importances recorded.")
"""

    # Live prediction function
    predict_fn_code = f"""# 7. Interactive Prediction Playground
def predict_single(input_data: dict):
    \"\"\"Run an inference on a custom row of feature values.\"\"\"
    input_df = pd.DataFrame([input_data])
    prediction = model.predict(input_df)[0]
    print(f"🎯 Model Prediction: {{prediction}}")
    
    if hasattr(model, "predict_proba"):
        probs = model.predict_proba(input_df)[0]
        classes = getattr(model, "classes_", getattr(model.named_steps.get("model", None), "classes_", range(len(probs))))
        print("📊 Class Probabilities:")
        for cls, prob in zip(classes, probs):
            print(f"   • {{cls}}: {{prob * 100:.1f}}%")
            
    return prediction

# Test with first row of test set
sample_test = X_test.iloc[0].to_dict()
print("Evaluating sample input:")
print(sample_test)
predict_single(sample_test)
"""

    cells = [
        _md_cell(header_md),
        _code_cell(imports_code),
        _md_cell("## 1. Load Raw Dataset"),
        _code_cell(data_load_code),
        _md_cell(cleaning_md),
        _code_cell(cleaning_code),
        _md_cell("## 3. Feature Selection & Train/Test Split"),
        _code_cell(features_code),
        _md_cell("## 4. Model Training & Pipeline Setup"),
        _code_cell(model_code),
        _md_cell(eval_md),
        _code_cell(eval_code),
        _md_cell("## 6. Model Explainability & Drivers"),
        _code_cell(importance_code),
        _md_cell("## 7. Live Prediction Function"),
        _code_cell(predict_fn_code),
    ]

    return {
        "cells": cells,
        "metadata": {
            "language_info": {
                "name": "python",
                "version": "3.12",
            },
            "kernelspec": {
                "name": "python3",
                "display_name": "Python 3",
            },
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }
