import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type AnalysisRun, type DataHealth, type ScenarioResult } from "../api";
import { ImportanceChart } from "../components/ImportanceChart";
import { RunTrace } from "../components/RunTrace";
import { Chat } from "../components/Chat";
import DataHealthScore from "../components/DataHealthScore";
import AIAnalysisTrace from "../components/AIAnalysisTrace";
import { DecisionIntelligenceDashboard } from "../components/DecisionIntelligenceDashboard";
import { WhatIfScenario } from "../components/WhatIfScenario";
import { LivePredictionPlayground } from "../components/LivePredictionPlayground";
import { DeployApiPanel } from "../components/DeployApiPanel";
import { VisualEDA } from "../components/VisualEDA";
import { QualityChecks, VerdictBadge } from "../components/Verdict";
import { SkeletonCard } from "../components/Skeleton";
import { ErrorNote, Metric, Panel } from "../components/shell";

const CLEANING_TITLES: Record<string, string> = {
  drop_duplicate_rows: "Removed duplicate rows",
  normalise_missing: "Converted placeholder text to nulls",
  trim_whitespace: "Trimmed whitespace",
  drop_empty_columns: "Removed empty columns",
};

const ACTION_COPY: Record<string, string> = {
  retry: "Tried again with changes",
  accept: "Stopped here",
  abandon: "Gave up on this question",
};

const TRACE_NODE_TITLES: Record<string, string> = {
  clean: "Cleaning",
  planner: "Planning",
  training: "Model training",
  explain: "Explainability",
  reflect: "Quality review",
  summary: "Summary",
};

export function RunDetail() {
  const { runId = "" } = useParams();
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataHealth, setDataHealth] = useState<DataHealth | null>(null);
  const [chatDatasetId, setChatDatasetId] = useState<string | null>(null);
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null);
  const [scenarioHistory, setScenarioHistory] = useState<ScenarioResult[]>([]);
  const [showDeployApi, setShowDeployApi] = useState(true);

  useEffect(() => {
    const loadRun = async () => {
      try {
        setDataHealth(null);
        setChatDatasetId(null);
        setScenarioResult(null);
        setScenarioHistory([]);
        const data = await api.getRun(runId);
        setRun(data);
        if (data.output_payload?.latest_scenario) setScenarioResult(data.output_payload.latest_scenario);
        if (data.output_payload?.scenario_history) setScenarioHistory(data.output_payload.scenario_history);

        try {
          let datasetId = data.dataset_id;

          if (!datasetId) {
            const datasets = await api.listDatasets(data.project_id);
            if (datasets.length > 0) {
              datasetId = datasets[0].id;
            }
          }

          if (datasetId) {
            setChatDatasetId(datasetId);
            const health = await api.getDataHealth(
              data.project_id,
              datasetId
            );
            setDataHealth(health);
          }
        } catch {
          setDataHealth(null);
          setChatDatasetId(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load run");
      }
    };

    loadRun();
  }, [runId]);

  if (error) return <div className="mx-auto max-w-3xl p-6"><ErrorNote>{error}</ErrorNote></div>;
  if (!run) {
  return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 h-7 w-44 animate-pulse rounded bg-rule" />
        <div className="mb-5 h-20 animate-pulse rounded-md bg-rule/50" />
        <div className="grid gap-5 lg:grid-cols-[250px_1fr]">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  const out = run.output_payload;
  const quality = out?.quality;
  const attempts = out?.attempts ?? [];
  const analysisTrace = (out?.steps ?? []).map((raw) => {
    const separator = raw.indexOf(":");
    const node = separator >= 0 ? raw.slice(0, separator) : raw;
    const event = separator >= 0 ? raw.slice(separator + 1) : "recorded";
    let detail = `Recorded pipeline event: ${raw}.`;

    if (node === "clean") {
      detail = out?.cleaning
        ? `${out.cleaning.rows_before.toLocaleString()} rows before cleaning and ${out.cleaning.rows_after.toLocaleString()} after. ${out.cleaning.actions.length} cleaning actions recorded: ${out.cleaning.actions.map((action) => `${action.action} (${action.rows_affected.toLocaleString()} rows)`).join("; ") || "none"}.`
        : "No cleaning report was returned for this run.";
    } else if (node === "planner") {
      detail = out?.plan
        ? `${out.plan.target_column} (${out.plan.task_type}). ${out.plan.rationale}${out.plan.data_quality_concerns.length ? ` Data quality concerns: ${out.plan.data_quality_concerns.join(" ")}` : ""}`
        : "No plan payload was returned for this run.";
    } else if (node === "training") {
      const round = event.match(/\(r(\d+)\)/)?.[1];
      const attempt = out?.attempts.find((item) => item.round === Number(round));
      detail = out?.training
        ? `${attempt ? `Round ${attempt.round}: ${attempt.best_model ?? "model not recorded"} scored ${attempt.primary_metric} ${attempt.primary_metric_value?.toFixed(4)}. ` : ""}${out.training.best_model ?? "Model not recorded"} used ${out.training.features_used.length} features; ${out.training.n_train.toLocaleString()} training rows and ${out.training.n_test.toLocaleString()} test rows.${out.training.sampled_from ? ` Sampled from ${out.training.sampled_from.toLocaleString()} rows.` : ""}`
        : "No training result was returned for this run.";
    } else if (node === "explain") {
      detail = out?.explanation
        ? `${out.explanation.method} explanation across ${out.explanation.rows_explained.toLocaleString()} rows. Top features: ${out.explanation.features.slice(0, 5).map((feature) => `${feature.feature} (${feature.importance.toFixed(4)})`).join(", ") || "none recorded"}.`
        : "No explanation result was returned for this run.";
    } else if (node === "reflect") {
      detail = out?.reflection
        ? `${out.reflection.action}: ${out.reflection.reasoning}`
        : "No reflection result was returned for this run.";
    } else if (node === "summary") {
      detail = out?.summary ?? "No summary was returned for this run.";
    }

    return {
      stage: TRACE_NODE_TITLES[node] ?? node,
      event,
      detail,
    };
  });

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-[12px] text-slate-500 mb-2">
        <Link to={`/projects/${run.project_id}`} className="hover:text-slate-900 transition-colors flex items-center gap-1 font-semibold text-slate-600">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Project
        </Link>
        <span className="text-slate-300">/</span>
        <span className="font-bold text-slate-900 truncate">Run {run.id.slice(0, 8)}</span>
      </div>

      {/* Main Header */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-teal-400 shadow-md">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-[26px] sm:text-[30px] font-extrabold tracking-tight text-slate-900">
                {out?.plan?.target_column ?? "Analysis"}
              </h1>
              {quality && <VerdictBadge verdict={quality.verdict} />}
            </div>
            <div className="flex items-center gap-2 text-[12px] text-slate-500 mt-1">
              <span className="capitalize font-bold text-slate-700">{out?.plan?.task_type ?? "Autonomous model"}</span>
              <span>·</span>
              <span>Run ID: <code className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-md">{run.id.slice(0, 8)}</code></span>
              {quality && (
                <>
                  <span>·</span>
                  <span className="font-semibold text-teal-700">Gate: {quality.gate_metric} {quality.gate_value.toFixed(4)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {run.status === "succeeded" && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setShowDeployApi(true);
                setTimeout(() => {
                  document.getElementById("decision-deploy-api")?.scrollIntoView({ behavior: "smooth" });
                }, 50);
              }}
              className="rounded-xl bg-teal-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-teal-700 shadow-md shadow-teal-600/20 hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <span>⚡</span> {showDeployApi ? "Live REST API" : "Deploy as API"}
            </button>
            <a
              href={api.notebookUrl(run.id)}
              className="rounded-xl border border-teal-500/30 bg-teal-50/70 px-3.5 py-2 text-[13px] font-bold text-teal-800 hover:bg-teal-100 transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <span>📓</span>
              <span>Notebook (.ipynb)</span>
            </a>
            <a
              href={api.exportUrl(run.id)}
              className="rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <span>📦</span>
              <span>Code & Model</span>
            </a>
            <a
              href={api.reportUrl(run.id)}
              className="rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <span>📄</span>
              <span>Report</span>
            </a>
          </div>
        )}
      </div>

      {/* Quick Jump Navigation Bar */}
      {run.status === "succeeded" && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white/80 backdrop-blur-sm p-1.5 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 pl-2 pr-1">Jump to:</span>
          <button
            onClick={() => {
              setShowDeployApi(true);
              setTimeout(() => document.getElementById("decision-deploy-api")?.scrollIntoView({ behavior: "smooth" }), 30);
            }}
            className="rounded-xl px-2.5 py-1 text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200/60 hover:bg-teal-100 transition-colors cursor-pointer"
          >
            ⚡ Live REST API
          </button>
          <button
            onClick={() => document.getElementById("decision-live-prediction")?.scrollIntoView({ behavior: "smooth" })}
            className="rounded-xl px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            🎮 Playground
          </button>
          <button
            onClick={() => document.getElementById("decision-what-if")?.scrollIntoView({ behavior: "smooth" })}
            className="rounded-xl px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            🔮 What-If Simulator
          </button>
          {dataHealth && (
            <button
              onClick={() => document.getElementById("decision-data-health")?.scrollIntoView({ behavior: "smooth" })}
              className="rounded-xl px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              🏥 Data Health
            </button>
          )}
          {chatDatasetId && (
            <button
              onClick={() => document.getElementById("decision-eda-charts")?.scrollIntoView({ behavior: "smooth" })}
              className="rounded-xl px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              📊 Visual EDA
            </button>
          )}
          <button
            onClick={() => document.getElementById("decision-ai-trace")?.scrollIntoView({ behavior: "smooth" })}
            className="rounded-xl px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            🧠 AI Trace
          </button>
          {out?.explanation && (
            <button
              onClick={() => document.getElementById("decision-feature-evidence")?.scrollIntoView({ behavior: "smooth" })}
              className="rounded-xl px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              🎯 Feature Importance
            </button>
          )}
          {run.experiments.length > 0 && (
            <button
              onClick={() => document.getElementById("decision-model-evidence")?.scrollIntoView({ behavior: "smooth" })}
              className="rounded-xl px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              🏆 Models Compared
            </button>
          )}
        </div>
      )}

      {run.status === "failed" && (
        <div className="mt-4"><ErrorNote>{run.error ?? "The run did not complete."}</ErrorNote></div>
      )}

      {!!out?.training?.leaked_features?.length && (
        <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50/80 px-4 py-4 shadow-2xs">
          <p className="text-[13px] font-bold text-amber-900 flex items-center gap-2">
            <span className="text-[16px]">🛡️</span>
            <span>Columns removed for restating the target (Leakage Shield™ Triggered)</span>
          </p>
          <ul className="mt-2.5 space-y-1">
            {out.training.leaked_features.map((f) => (
              <li key={f.column} className="text-[13px] leading-snug text-amber-800">
                <span className="tabular font-bold text-amber-950">{f.column}</span> — {f.reason}
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[12px] leading-snug text-amber-700">
            Scores below come from a candidate model trained without these columns. Left in, they would have produced a deceptive 100% score while learning nothing real.
          </p>
        </div>
      )}

      {out?.training?.additive_leakage && (
        <div className="mt-5 rounded-2xl border border-rose-300 bg-rose-50/80 px-4 py-4 shadow-2xs">
          <p className="text-[13px] font-bold text-rose-900 flex items-center gap-2">
            <span className="text-[16px]">⚠️</span>
            <span>The target is mathematically derived from its own columns</span>
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-rose-800">
            {out.training.additive_leakage.reason}
          </p>
          <p className="tabular mt-2 text-[12px] font-mono text-rose-900 bg-rose-100/60 p-2 rounded-lg">
            {out.training.additive_leakage.contributors
              .map((c) => `${c.column} ×${c.coefficient.toFixed(3)}`)
              .join("  ·  ")}
          </p>
          <p className="mt-2 text-[12px] leading-snug text-rose-700">
            Coefficients near 1.0 indicate the target is an exact mathematical sum. Remove the component columns or select a different non-derived target.
          </p>
        </div>
      )}

      {out?.training?.sampled_from && (
        <p className="tabular mt-4 text-[12px] text-slate-500 font-medium">
          Sampled {out.training.n_train + out.training.n_test} rows from{" "}
          {out.training.sampled_from.toLocaleString()} to keep the run interactive.
        </p>
      )}

      {dataHealth && (
        <div id="decision-data-health" className="mt-6">
          <DataHealthScore health={dataHealth} />
        </div>
      )}

      <div id="decision-ai-trace" className="mt-6">
        <AIAnalysisTrace steps={analysisTrace}>
          {chatDatasetId && (
            <Chat
              projectId={run.project_id}
              datasetId={chatDatasetId}
              hasDataset
              embedded
            />
          )}
        </AIAnalysisTrace>
      </div>

      {out?.summary && (
        <div id="decision-analysis-summary" className="rise mt-6 rounded-2xl border border-teal-500/30 bg-teal-50/50 backdrop-blur-sm p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-2 text-[12px] font-extrabold uppercase tracking-wider text-teal-800">
            <span>✨</span>
            <span>Autonomous Executive Summary</span>
          </div>
          <p className="text-[15px] sm:text-[16px] leading-relaxed text-slate-800 font-medium">
            {out.summary}
          </p>
        </div>
      )}

      <div className="mt-7 grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="rise rise-1 space-y-6">
          <Panel title="How it ran">
            <RunTrace steps={out?.steps ?? []} />
          </Panel>

          {out?.cleaning?.changed && (
            <Panel
              title="Cleaned first"
              aside={
                <span className="tabular text-[12px] font-bold text-slate-500">
                  {out.cleaning.rows_before.toLocaleString()} →{" "}
                  {out.cleaning.rows_after.toLocaleString()} rows
                </span>
              }
            >
              <ul className="space-y-3">
                {out.cleaning.actions.map((a) => (
                  <li key={a.action} className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
                    <div className="text-[13px] font-bold text-slate-800">
                      {CLEANING_TITLES[a.action] ?? a.action}
                      {a.rows_affected > 0 && (
                        <span className="tabular ml-1.5 text-slate-500 font-normal">
                          ({a.rows_affected.toLocaleString()})
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] leading-snug text-slate-500 mt-0.5">{a.detail}</p>
                    {a.columns.length > 0 && (
                      <p className="tabular text-[11px] text-slate-700 font-mono mt-1">
                        {a.columns.join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {out?.training && (
            <Panel title="Data used">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Train rows" value={out.training.n_train.toLocaleString()} />
                <Metric label="Test rows" value={out.training.n_test.toLocaleString()} />
                <Metric label="Features" value={out.training.features_used.length} />
                <Metric label="Dropped" value={out.training.features_dropped.length} />
              </div>
              {out.training.features_dropped.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                  {out.training.features_dropped.map((d) => (
                    <li key={d.column} className="text-[12px] leading-snug text-slate-500">
                      <span className="tabular font-semibold text-slate-800">{d.column}</span> — {d.reason}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>

        <div className="rise rise-2 space-y-6">
          {out?.explanation && (
            <div id="decision-feature-evidence">
              <Panel title="What drove the predictions">
                <ImportanceChart explanation={out.explanation} />
              </Panel>
            </div>
          )}

          {quality && (
            <div id="decision-quality-evidence">
              <Panel
                title="Quality checks"
                aside={
                  <span className="tabular text-[12px] font-bold text-teal-700">
                    {quality.gate_metric} {quality.gate_value?.toFixed(4)}
                  </span>
                }
              >
                <QualityChecks quality={quality} />
                {quality.dead_features.length > 0 && (
                  <p className="mt-3 border-t border-slate-100 pt-3 text-[12px] leading-snug text-slate-500">
                    Contributing almost nothing: {" "}
                    <span className="tabular font-mono text-slate-700">{quality.dead_features.join(", ")}</span>
                  </p>
                )}
              </Panel>
            </div>
          )}

          {out?.reflection && (
            <Panel
              title="Decision"
              aside={
                <span className="tabular text-[12px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                  {ACTION_COPY[out.reflection.action] ?? out.reflection.action}
                </span>
              }
            >
              <p className="text-[14px] leading-relaxed text-slate-700 font-medium">
                {out.reflection.reasoning}
              </p>
            </Panel>
          )}

          {attempts.length > 1 && (
            <Panel
              title="Attempts"
              aside={
                <span className="text-[11px] font-semibold text-slate-400">
                  judged on gate metric
                </span>
              }
            >
              <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase font-bold tracking-wider text-slate-400">
                    <th className="pb-2 font-bold min-w-[50px]">Round</th>
                    <th className="pb-2 font-bold min-w-[100px]">Model</th>
                    <th className="pb-2 font-bold min-w-[150px]">Excluded</th>
                    <th className="pb-2 text-right font-bold min-w-[80px]">Decided on</th>
                    <th className="pb-2 text-right font-bold min-w-[80px]">Headline</th>
                  </tr>
                </thead>
                <tbody className="tabular divide-y divide-slate-100">
                  {attempts.map((a) => (
                    <tr key={a.round} className="hover:bg-slate-50/50">
                      <td className="py-2 font-semibold text-slate-800">{a.round}</td>
                      <td className="py-2 font-bold text-slate-900">{a.best_model}</td>
                      <td className="py-2 text-slate-500">
                        {a.excluded_features.length ? a.excluded_features.join(", ") : "—"}
                      </td>
                      <td className="py-2 text-right font-bold text-teal-700">
                        {a.gate_value != null ? (
                          <>
                            <span className="text-slate-400 font-normal">{a.gate_metric} </span>
                            {a.gate_value.toFixed(4)}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 text-right text-slate-500">
                        {a.primary_metric} {a.primary_metric_value?.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </Panel>
          )}

          {run.experiments.length > 0 && (
            <div id="decision-model-evidence">
              <Panel title="Models compared">
              <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase font-bold tracking-wider text-slate-400">
                    <th className="pb-2 font-bold min-w-[120px]">Model</th>
                    <th className="pb-2 text-right font-bold min-w-[80px]">Metric</th>
                    <th className="pb-2 text-right font-bold min-w-[80px]">Train Time</th>
                  </tr>
                </thead>
                <tbody className="tabular divide-y divide-slate-100">
                  {run.experiments.map((e) => (
                    <tr key={e.model_name} className="hover:bg-slate-50/50">
                      <td className="py-2 font-semibold text-slate-800">
                        {e.model_name}
                        {e.is_selected && (
                          <span className="ml-2 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-800 shadow-2xs">
                            ★ Selected
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right font-bold text-slate-900">
                        {e.primary_metric} {e.primary_metric_value?.toFixed(4)}
                      </td>
                      <td className="py-2 text-right text-slate-500">
                        {e.train_seconds?.toFixed(2)}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              </Panel>
            </div>
          )}

          {out?.plan?.rationale && (
            <Panel title="Why this target">
              <p className="text-[14px] leading-relaxed text-slate-700 font-medium">{out.plan.rationale}</p>
            </Panel>
          )}
        </div>
      </div>

      {run.status === "succeeded" && (out?.training?.features_used.length ?? 0) > 0 && showDeployApi && (
        <div id="decision-deploy-api" className="mt-7">
          <DeployApiPanel
            runId={run.id}
            targetColumn={out?.plan?.target_column ?? "Target"}
            taskType={out?.plan?.task_type ?? "classification"}
            onClose={() => setShowDeployApi(false)}
          />
        </div>
      )}

      {run.status === "succeeded" && (out?.training?.features_used.length ?? 0) > 0 && (
        <div id="decision-live-prediction" className="mt-7">
          <LivePredictionPlayground runId={run.id} />
        </div>
      )}

      {run.status === "succeeded" && (out?.training?.features_used.length ?? 0) > 0 && (
        <div id="decision-what-if" className="mt-7">
          <WhatIfScenario
            history={scenarioHistory}
            key={run.id}
            runId={run.id}
            features={out!.training!.features_used}
            initialFeature={out?.explanation?.features[0]?.feature}
            onResult={(res) => { setScenarioResult(res); if (res) setScenarioHistory(prev => [...prev, res]); }}
          />
        </div>
      )}

      {chatDatasetId && (
        <div id="decision-eda-charts" className="mt-7">
          <VisualEDA projectId={run.project_id} datasetId={chatDatasetId} />
        </div>
      )}

      {scenarioResult && (
        <div className="mt-5">
          <DecisionIntelligenceDashboard
            run={run}
            dataHealth={dataHealth}
            scenario={scenarioResult}
          />
        </div>
      )}
    </div>
  );
}
