import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
import zipfile
import tempfile
import os
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.llm import get_llm, message_text
from app.db.models import RunStatus, User
from app.db.session import get_db
from app.schemas.analysis import AnalysisRequest, AnalysisRunRead, LLMCheckResponse
from app.schemas.scenario import ScenarioRequest
from app.services import analysis as svc
from app.services import datasets as dataset_svc
from app.services import projects as project_svc
from app.services import scenarios as scenario_svc
from app.services import storage
from app.services.data_health import calculate_data_health

router = APIRouter(tags=["analysis"])


@router.get("/llm/check", response_model=LLMCheckResponse, tags=["health"])
async def llm_check():
    """Make one trivial LLM call and report exactly what happened.

    Worth having as an endpoint rather than a script: it isolates provider
    and credential problems from graph problems, so when a run fails you
    know immediately which half to look at.
    """
    model_name = {
        "google": settings.GOOGLE_MODEL,
        "groq": settings.GROQ_MODEL,
        "ollama": settings.OLLAMA_MODEL,
    }.get(settings.LLM_PROVIDER, "unknown")

    started = time.perf_counter()
    try:
        response = await get_llm().ainvoke(
            [("human", "Reply with exactly: OK")]
        )
        return LLMCheckResponse(
            provider=settings.LLM_PROVIDER, model=model_name, ok=True,
            reply=message_text(response)[:200],
            latency_ms=round((time.perf_counter() - started) * 1000, 1),
        )
    except Exception as exc:
        return LLMCheckResponse(
            provider=settings.LLM_PROVIDER, model=model_name, ok=False,
            error_type=type(exc).__name__, error=str(exc)[:500],
            latency_ms=round((time.perf_counter() - started) * 1000, 1),
        )


@router.post(
    "/projects/{project_id}/analysis",
    response_model=AnalysisRunRead,
    status_code=status.HTTP_201_CREATED,
)
async def start_analysis(
    project_id: uuid.UUID,
    payload: AnalysisRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Run the analysis graph and return the completed run.

    Synchronous for now. Training a couple of models on a small CSV takes a
    few seconds, which an HTTP request tolerates. Phase 4 moves this to the
    arq worker with a job id, because it will not stay small.
    """
    project = await project_svc.get_project(db, project_id, user.id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")

    dataset = await dataset_svc.get_dataset(db, payload.dataset_id, user.id)
    if dataset is None or dataset.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dataset not found")
    if not dataset.profile:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Dataset has no profile; re-upload it."
        )

    return await svc.run_analysis(db, project, dataset, payload.user_goal)


@router.get("/projects/{project_id}/analysis", response_model=list[AnalysisRunRead])
async def list_runs(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await svc.list_runs(db, project_id, user.id)


@router.get("/analysis/{run_id}/report.pdf", response_class=Response)
async def download_report(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Render the run as an executive PDF report."""
    run = await svc.get_run(db, run_id, user.id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    if run.status != RunStatus.SUCCEEDED:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This run did not complete, so there is nothing to report.",
        )

    project = await project_svc.get_project(db, run.project_id, user.id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")

    pdf, _ = await svc.build_and_store_report(db, run, project)
    filename = f"{project.name.replace(' ', '-').lower()}-analysis.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/analysis/{run_id}", response_model=AnalysisRunRead)
async def get_run(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    run = await svc.get_run(db, run_id, user.id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    return run


@router.post("/analysis/{run_id}/scenarios")
async def run_what_if_scenario(
    run_id: uuid.UUID,
    payload: ScenarioRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Compare real predictions from a saved analysis model before/after a change."""
    run = await svc.get_run(db, run_id, user.id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    if run.agent_name != "analysis_graph" or run.status != RunStatus.SUCCEEDED:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "What-if scenarios require a successfully completed analysis run.",
        )

    output = run.output_payload or {}
    training = output.get("training") or {}
    features = training.get("features_used") or []
    if payload.feature not in features:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Choose a feature used by this run's trained model.",
        )

    model_path = output.get("model_path") or next(
        (experiment.artifact_path for experiment in run.experiments if experiment.is_selected),
        None,
    )
    if not model_path:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This run has no saved model artifact for scenario predictions.",
        )

    dataset_id = run.dataset_id
    if dataset_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This run has no linked dataset.")
    dataset = await dataset_svc.get_dataset(db, dataset_id, user.id)
    if dataset is None or dataset.project_id != run.project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dataset not found")

    dataset_path = storage.resolve(dataset.storage_path)
    cleaned_path = storage.resolve(f"cleaned/{run.id}.csv")
    if cleaned_path.is_file():
        dataset_path = cleaned_path

    quality = output.get("quality") or {}
    explanation = output.get("explanation") or {}
    data_health = calculate_data_health(dataset.profile or {})
    decision_context = {
        "dataset": {"columns": dataset.n_columns},
        "data_health": {
            "score": data_health["score"],
            "status": data_health["status"],
            "metrics": data_health["metrics"],
            "findings": data_health["findings"],
        },
        "target": (output.get("plan") or {}).get("target_column"),
        "task_type": training.get("task_type"),
        "model": training.get("best_model"),
        "training_rows": training.get("n_train"),
        "quality": {
            "verdict": quality.get("verdict"),
            "gate_metric": quality.get("gate_metric"),
            "gate_value": quality.get("gate_value"),
            "reasons": quality.get("reasons", []),
            "checks": [
                {
                    "name": check.get("name"),
                    "passed": check.get("passed"),
                    "detail": check.get("detail"),
                }
                for check in quality.get("checks", [])
                if not check.get("passed")
            ],
        },
        "leaked_features": [
            item.get("column") for item in training.get("leaked_features", [])
        ],
        "top_features": [
            {
                "feature": feature.get("feature"),
                "importance": feature.get("importance"),
                "method": explanation.get("method"),
            }
            for feature in explanation.get("features", [])[:5]
        ],
    }

    try:
        scenario_result = await scenario_svc.run_scenario(
            model_path=model_path,
            dataset_path=dataset_path,
            features=features,
            task_type=training.get("task_type", ""),
            feature=payload.feature,
            operation=payload.operation,
            value=payload.value,
            dataset_rows=dataset.n_rows,
            decision_context=decision_context,
        )
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)
        ) from exc
    except FileNotFoundError as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "The saved model or dataset file for this run is unavailable.",
        ) from exc

    history = output.get("scenario_history", [])
    history.append(scenario_result)
    run.output_payload = {
        **output,
        "latest_scenario": scenario_result,
        "scenario_history": history,
    }
    await db.commit()
    return scenario_result

@router.get("/analysis/{run_id}/export", response_class=FileResponse)
async def export_model_and_code(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Export the trained model, cleaned dataset, and a starter Python script as a ZIP archive."""
    run = await svc.get_run(db, run_id, user.id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    if run.status != RunStatus.SUCCEEDED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Run did not complete.")

    output = run.output_payload or {}
    model_path = output.get("model_path")
    if not model_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No model artifact found for this run.")

    model_file = storage.resolve(model_path)
    if not model_file.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model artifact file missing.")

    cleaned_file = storage.resolve(f"cleaned/{run.id}.csv")
    dataset_file = cleaned_file if cleaned_file.exists() else None

    training = output.get("training") or {}
    plan = output.get("plan") or {}
    target_column = plan.get("target_column")
    task_type = training.get("task_type")

    script = f"""# Data Intelligence OS - Model Export
# Task: {task_type}
# Target: {target_column}

import pandas as pd
import joblib

print("Loading data...")
df = pd.read_csv("dataset.csv")

print("Loading model pipeline...")
model = joblib.load("model.joblib")

# The model is a full scikit-learn pipeline, including all necessary
# imputation, encoding, and scaling steps.

# Separate features from target
X = df.drop(columns=["{target_column}"])
y = df["{target_column}"]

print("Making predictions on the dataset...")
predictions = model.predict(X)

print("First 10 predictions:")
print(predictions[:10])
"""

    fd, temp_path = tempfile.mkstemp(suffix=".zip")
    os.close(fd)
    
    with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(model_file, "model.joblib")
        if dataset_file:
            zf.write(dataset_file, "dataset.csv")
        zf.writestr("predict.py", script)
        zf.writestr("README.md", "# Model Export\n\nRun `python predict.py` to see the model in action. Ensure you have `pandas`, `joblib`, and `scikit-learn` installed.")

    task = BackgroundTask(os.remove, temp_path)
    return FileResponse(
        path=temp_path,
        filename=f"model-export-{run.id}.zip",
        media_type="application/zip",
        background=task,
    )
