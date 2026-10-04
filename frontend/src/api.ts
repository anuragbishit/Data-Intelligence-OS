/// <reference types="vite/client" />
/* Typed client for the analyst API. Mirrors the FastAPI response models. */

const BASE = (import.meta.env.VITE_API_BASE ?? "") + "/api/v1";

export type RunStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  target_column: string | null;
  task_type: string;
  created_at: string;
}

export interface ProjectSummary extends Project {
  dataset_count: number;
  run_count: number;
  row_count: number | null;
  last_run_id: string | null;
  last_verdict: "strong" | "acceptable" | "weak" | null;
  last_metric: string | null;
  last_value: number | null;
  last_run_at: string | null;
  leaked_count: number;
  derived_target: boolean;
}

export interface DatasetSummary {
  id: string;
  project_id: string;
  original_filename: string;
  size_bytes: number;
  n_rows: number | null;
  n_columns: number | null;
  created_at: string;
}

export interface ColumnProfile {
  name: string;
  dtype: string;
  semantic_type: string;
  null_pct: number;
  unique_count: number;
  stats?: Record<string, number | string | null>;
  top_values?: { value: unknown; count: number; pct: number }[];
}

export interface ProfileWarning {
  code: string;
  severity: "info" | "warning" | "error";
  column: string | null;
  message: string;
}

export interface Profile {
  schema_version: number;
  shape: { rows: number; columns: number };
  duplicate_rows: number;
  columns: ColumnProfile[];
  warnings: ProfileWarning[];
  target_candidates: {
    column: string;
    task_type: string;
    confidence: number;
    reason: string;
  }[];
  correlations: { pairs: { a: string; b: string; r: number }[] };
}

export interface DataHealth {
  score: number;
  status: string;
  metrics: {
    completeness: number;
    validity: number;
    uniqueness: number;
    consistency: number;
  };
  dataset: {
    rows: number;
    columns: number;
    duplicate_rows: number;
  };
  findings: { type: string; severity: string; message: string }[];
}

export type ScenarioOperation =
  | "increase_percent"
  | "decrease_percent"
  | "add"
  | "subtract"
  | "multiply"
  | "divide"
  | "set";

export interface ScenarioRequest {
  feature: string;
  operation: ScenarioOperation;
  value: number | string;
}

export interface ScenarioClassDistribution {
  class: string | number | boolean | null;
  count: number;
  rate_percent: number;
}

export interface ScenarioPredictionSummary {
  rows_evaluated: number;
  predicted_class_distribution?: ScenarioClassDistribution[];
  mean_probability_by_class?: {
    class: string | number | boolean | null;
    probability_percent: number;
  }[];
  mean_prediction?: number;
  median_prediction?: number;
  minimum_prediction?: number;
  maximum_prediction?: number;
}

export interface ScenarioResult {
  task_type: "classification" | "regression";
  feature_change: {
    feature: string;
    operation: ScenarioOperation;
    requested_value: number | string;
    rows_changed: number;
    changed_rate_percent: number;
    baseline: {
      kind: "numeric" | "categorical";
      mean?: number | null;
      minimum?: number | null;
      maximum?: number | null;
      top_values?: { value: unknown; count: number }[];
    };
    scenario: {
      kind: "numeric" | "categorical";
      mean?: number | null;
      minimum?: number | null;
      maximum?: number | null;
      top_values?: { value: unknown; count: number }[];
    };
    unseen_category: boolean;
  };
  data_scope: {
    dataset_rows_profiled: number | null;
    rows_scanned: number;
    rows_evaluated: number;
    sampled: boolean;
    row_read_limit_reached: boolean;
    row_read_limit: number;
  };
  baseline_result: ScenarioPredictionSummary;
  scenario_result: ScenarioPredictionSummary;
  impact: {
    absolute_change?: number;
    percentage_change: number | null;
    changed_prediction_count: number;
    changed_prediction_rate_percent: number;
    focus_class?: string | number | boolean | null;
    baseline_focus_class_rate_percent?: number | null;
    scenario_focus_class_rate_percent?: number | null;
    absolute_change_percentage_points?: number | null;
    class_distribution_changes?: {
      class: string | number | boolean | null;
      baseline_rate_percent: number;
      scenario_rate_percent: number;
      absolute_change_percentage_points: number;
      percentage_change: number | null;
    }[];
  };
  ai_explanation: string | null;
  ai_recommendation: string | null;
}

export interface UploadResponse {
  dataset: DatasetSummary;
  deduplicated: boolean;
  warning_count: number;
  error_count: number;
  target_candidates: Profile["target_candidates"];
}

export interface Experiment {
  model_name: string;
  metrics: Record<string, number> | null;
  primary_metric: string | null;
  primary_metric_value: number | null;
  train_seconds: number | null;
  is_selected: boolean;
  artifact_path: string | null;
}

export interface QualityCheck {
  name: string;
  passed: boolean;
  detail: string;
  /* Whether this check drives the verdict. A non-gating check that did not
     pass found something that was handled, not a failure. */
  gating?: boolean;
}

export interface Quality {
  verdict: "strong" | "acceptable" | "weak";
  primary_metric: string;
  primary_value: number;
  gate_metric: string;
  gate_value: number;
  reasons: string[];
  dead_features: string[];
  suggestions: string[];
  checks: QualityCheck[];
}

export interface Attempt {
  round: number;
  target_column: string;
  task_type: string;
  excluded_features: string[];
  best_model: string | null;
  primary_metric: string;
  primary_metric_value: number;
  /* Stamped by the reflection node. Absent on runs recorded before it existed. */
  gate_metric?: string;
  gate_value?: number;
  verdict?: string;
}

export interface FeatureImportance {
  feature: string;
  importance: number;
  rank: number;
  encoded_parts: number;
}

export interface Explanation {
  method: "shap" | "permutation" | "unavailable";
  model_name: string;
  rows_explained: number;
  features: FeatureImportance[];
  note: string | null;
}

export interface CleaningAction {
  action: string;
  detail: string;
  rows_affected: number;
  columns: string[];
}

export interface CleaningReport {
  rows_before: number;
  rows_after: number;
  columns_before: number;
  columns_after: number;
  actions: CleaningAction[];
  changed: boolean;
}

export interface RunOutput {
  plan: {
    target_column: string;
    task_type: string;
    rationale: string;
    excluded_columns: string[];
    data_quality_concerns: string[];
  } | null;
  summary: string | null;
  steps: string[];
  training: {
    task_type: string;
    target_column: string;
    n_train: number;
    n_test: number;
    features_used: string[];
    features_dropped: { column: string; reason: string }[];
    leaked_features?: { column: string; score: number; reason: string }[];
    additive_leakage?: {
      r2: number;
      reason: string;
      contributors: { column: string; coefficient: number }[];
    } | null;
    sampled_from?: number | null;
    best_model: string | null;
  } | null;
  explanation: Explanation | null;
  cleaning: CleaningReport | null;
  quality: Quality | null;
  reflection: { action: string; reasoning: string } | null;
  attempts: Attempt[];
  model_path: string | null;
}

export interface AnalysisRun {
  id: string;
  project_id: string;
  dataset_id: string | null;
  status: RunStatus;
  agent_name: string;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  output_payload: RunOutput | null;
  experiments: Experiment[];
}

export interface LLMCheck {
  provider: string;
  model: string;
  ok: boolean;
  reply: string | null;
  error_type: string | null;
  error: string | null;
  latency_ms: number | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  metadata?: { tools?: { tool: string; arguments: Record<string, unknown> }[] } | null;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* response had no JSON body */
    }
    throw new ApiError(res.status, detail);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  llmCheck: () => request<LLMCheck>("/llm/check"),

  listProjects: () => request<ProjectSummary[]>("/projects"),
  createProject: (name: string, description?: string) =>
    request<Project>("/projects", {
      method: "POST",
      body: JSON.stringify({ name, description: description || null }),
    }),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" }),

  listDatasets: (projectId: string) =>
    request<DatasetSummary[]>(`/projects/${projectId}/datasets`),
  uploadDataset: (projectId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<UploadResponse>(`/projects/${projectId}/datasets`, {
      method: "POST",
      body: form,
    });
  },
  getProfile: (projectId: string, datasetId: string) =>
    request<Profile>(`/projects/${projectId}/datasets/${datasetId}/profile`),

  startAnalysis: (projectId: string, datasetId: string, userGoal?: string) =>
    request<AnalysisRun>(`/projects/${projectId}/analysis`, {
      method: "POST",
      body: JSON.stringify({ dataset_id: datasetId, user_goal: userGoal || null }),
    }),
  listRuns: (projectId: string) => request<AnalysisRun[]>(`/projects/${projectId}/analysis`),

  chatHistory: (projectId: string) =>
    request<ChatMessage[]>(`/projects/${projectId}/chat`),
  chatAsk: (projectId: string, message: string, datasetId?: string) =>
    request<ChatMessage>(`/projects/${projectId}/chat`, {
      method: "POST",
      body: JSON.stringify({ message, dataset_id: datasetId ?? null }),
    }),
  chatClear: (projectId: string) =>
    request<void>(`/projects/${projectId}/chat`, { method: "DELETE" }),
  getRun: (runId: string) => request<AnalysisRun>(`/analysis/${runId}`),
  reportUrl: (runId: string) => `${BASE}/analysis/${runId}/report.pdf`,
  getDataHealth: (projectId: string, datasetId: string) =>
    request<DataHealth>(`/projects/${projectId}/datasets/${datasetId}/health`),
  runScenario: (runId: string, scenario: ScenarioRequest) =>
    request<ScenarioResult>(`/analysis/${runId}/scenarios`, {
      method: "POST",
      body: JSON.stringify(scenario),
    }),

};
