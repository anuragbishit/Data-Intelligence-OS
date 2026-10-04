# Data Intelligence OS Architecture

## User Workflow

This diagram describes the user-facing progression. It is a workflow across
multiple UI/API requests, not one linear backend function call.

```mermaid
flowchart TD
  U[User] --> FE[React Frontend]
  FE --> API[FastAPI Backend]
  API --> DE[Data Engine<br/>upload · clean · profile · Data Health]
  DE --> AA[AI Analyst<br/>analysis · model training · explainability]
  AA --> EV[Evidence and Model Results<br/>quality · metrics · trace]
  EV --> QA[Interactive AI Q&A]
  EV --> WI[What-if Scenario Engine]
  WI --> DI[Decision Intelligence Dashboard]
  EV --> PDF[Report Generation]
  DI -. user may download the existing run PDF .-> PDF
```

Q&A, scenario evaluation, and report generation are separate API operations
associated with a completed run. The Decision Intelligence view is assembled in
the frontend after a scenario response. Scenario results are currently
transient and are not part of the PDF. The dotted Decision-to-PDF arrow means a
user can download the existing run report after reviewing the dashboard; it
does not mean scenario or dashboard values are currently included in that PDF.

## Runtime Architecture

```mermaid
flowchart LR
  U[User] --> FE[React 18 + Vite]
  FE -->|/api/v1 requests| API[FastAPI]

  subgraph DE[Data Engine]
    UP[Upload and size validation]
    PROFILE[Profile CSV]
    CLEAN[Clean copy]
    HEALTH[Data Health calculation]
    UP --> PROFILE
    PROFILE --> HEALTH
  end

  API --> UP
  API --> HEALTH
  API --> GRAPH[LangGraph analysis]
  GRAPH --> CLEAN

  subgraph AA[AI Analyst]
    PLAN[Planner]
    TRAIN[Train candidates]
    EXPLAIN[SHAP or permutation]
    QUALITY[Deterministic quality gates]
    REFLECT[Bounded reflection]
    SUMMARY[Summary]
    PLAN --> TRAIN --> EXPLAIN --> QUALITY --> REFLECT --> SUMMARY
    REFLECT -->|validated retry| TRAIN
  end
  CLEAN --> PLAN
  SUMMARY --> RUN[Run response and trace events]
  RUN --> FE

  API -->|chat route| CHAT[Dataset Q&A service]
  CHAT --> DATA[/selected dataset/]
  CHAT -->|validated tool answers| LLM[Configured LLM provider]
  CHAT --> FE

  API -->|scenario route| WHATIF[What-if service]
  WHATIF -->|load saved pipeline| MODEL[/joblib model artifact/]
  WHATIF -->|baseline and changed rows| DATA
  WHATIF --> LLM
  WHATIF --> FE
  FE --> DI[Decision Intelligence<br/>frontend evidence composition]

  API -->|report route| REPORT[ReportLab PDF service]
  RUN --> REPORT
  REPORT --> PDF[/PDF report/]
  REPORT --> FE

  subgraph COMPOSE[Docker Compose]
    API
    FE
    PG[(PostgreSQL)]
    REDIS[(Redis)]
  end
  API --> PG
  PROFILE --> PG
  API -. readiness ping only .-> REDIS
  UP --> RAW[/uploaded CSV/]
  CLEAN --> CLEANED[/cleaned CSV/]
  TRAIN --> MODEL
  PLAN --> LLM
  REFLECT --> LLM
  SUMMARY --> LLM
  GRAPH -->|optional tracing| LS[LangSmith]
```

All `/storage` paths in the diagram are files under the mounted storage volume.
PostgreSQL stores project/dataset metadata and profiles, run outputs, chat
messages, experiments, and report records; CSV and model contents stay on disk.
Redis is currently used by `/ready` to verify connectivity, not for queues or
graph checkpointing. LangSmith tracing is optional.

## The analysis graph

```mermaid
flowchart TD
  START([run requested]) --> CL[cleaning<br/><i>deterministic file operation</i>]
  CL --> PL[planner<br/><i>LLM</i>]
  PL -->|error| E1([end: failed])
  PL --> TR[training<br/><i>deterministic</i>]
  TR -->|error| E2([end: failed])
  TR --> EX[explain<br/><i>SHAP / permutation</i>]
  EX --> RF{reflect}
  RF -->|retry| TR
  RF -->|accept / abandon| SU[summary<br/><i>LLM</i>]
  SU --> E3([end: succeeded])
```

Three LLM calls at most per round; training and explanation are pure Python.

## Where the boundaries are

| Layer | LLM? | Why |
|---|---|---|
| `services/profiling` | no | Ground truth. Same CSV, same profile, always. |
| `services/training` | no | A hallucinated plan must not reach a pipeline. |
| `services/explain` | no | Importances are measured, not narrated. |
| `services/quality` | no | "Is this weak?" is a threshold question. |
| `services/data_health` | no | Health metrics are calculated from the stored profile. |
| `services/scenarios.evaluate_scenario` | no | The saved fitted model predicts both baseline and modified copies. |
| `services/scenarios.explain_scenario` | yes | Interpretation/action is constrained to supplied calculated evidence. |
| `services/chat_tools` | no | Tools compute values from the selected dataset. |
| `agents/planner` | yes | Choosing a target needs judgement. |
| `agents/reflection` | yes | *What to do* about a weak result needs judgement. |
| `agents/summary` | yes | Prose for a human reader. |
| `agents/chat` | yes | The model chooses among schema-validated dataset tools. |

The AI Analysis Trace and Decision Intelligence Dashboard are frontend views,
not separate LLM agents. The trace renders recorded run events; the decision
view combines analysis output, Data Health, quality, feature importance, and
the current What-if response.

## Retry loop termination

Any one of these ends it:

1. **Round cap** — `MAX_REFLECTION_ROUNDS = 2`, so three attempts maximum.
2. **Improvement margin** — a retry must beat the incumbent by 0.02 on the
   *gate* metric (ROC-AUC for classification, R² for regression). Without a
   margin the loop churns on noise.
3. **No-op detection** — a revision that changes nothing becomes an accept,
   because re-running it would score identically forever.

Plus guards that strip unknown column names and refuse to exclude every
remaining feature.

## Failure policy per node

| Node fails | Behaviour |
|---|---|
| planner | Fall back to the deterministic top target candidate; continue. |
| training | End the run. There is nothing to explain or summarise. |
| explain | Continue without importances; metrics still stand. |
| reflect | Accept the current result and report it. |
| summary | Synthesise text from the metrics and succeed anyway. |

Only a training failure is fatal, because only training produces the thing the
run exists to deliver.

## Data flow constraints

- Datasets are stored on disk, referenced by `Dataset.storage_path`. Contents
  never enter Postgres and never enter graph state.
- Fitted pipelines are persisted to `storage/models/{run_id}/` and referenced
  by path, populating `Experiment.artifact_path`.
- `prepare_split()` is seeded, so the explain step reconstructs the identical
  test set rather than carrying DataFrames through state.
- Every value written to a JSONB column passes through a coercion helper:
  numpy scalars are not JSON-serialisable, and `NaN`/`Inf` are rejected by
  Postgres outright.

## Run tree

`agent_runs.parent_run_id` is self-referential. A run owns one child row per
training round, so the stored history mirrors the graph's real execution
including retries.
