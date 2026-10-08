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

  useEffect(() => {
    const loadRun = async () => {
      try {
        setDataHealth(null);
        setChatDatasetId(null);
        setScenarioResult(null);
        setScenarioHistory([]); setScenarioHistory([]);
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
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        to={`/projects/${run.project_id}`}
        className="tabular text-[12px] text-ink-faint hover:text-ink"
      >
        ← back to project
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-bold tracking-tight">
          {out?.plan?.target_column ?? "Analysis"}
        </h1>
        {quality && <VerdictBadge verdict={quality.verdict} />}
        {out?.plan && (
          <span className="tabular text-[12px] text-ink-faint">{out.plan.task_type}</span>
        )}
        {run.status === "succeeded" && (
          <div className="ml-auto flex gap-2">
            <a
              href={api.exportUrl(run.id)}
              className="rounded border border-rule-strong px-3 py-1.5 text-[13px] font-medium text-ink-soft hover:bg-paper"
            >
              Download Code & Model
            </a>
            <a
              href={api.reportUrl(run.id)}
              className="rounded border border-rule-strong px-3 py-1.5 text-[13px] font-medium text-ink-soft hover:bg-paper"
            >
              Download report
            </a>
          </div>
        )}
      </div>

      {run.status === "failed" && (
        <div className="mt-4"><ErrorNote>{run.error ?? "The run did not complete."}</ErrorNote></div>
      )}

      {!!out?.training?.leaked_features?.length && (
        <div className="mt-5 rounded-md border border-weak/40 bg-weak-wash px-4 py-3">
          <p className="text-[13px] font-semibold text-weak">
            Columns removed for restating the target
          </p>
          <ul className="mt-1.5 space-y-1">
            {out.training.leaked_features.map((f) => (
              <li key={f.column} className="text-[13px] leading-snug text-ink-soft">
                <span className="tabular font-medium">{f.column}</span> — {f.reason}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] leading-snug text-ink-soft">
            Scores below come from a model trained without them. Left in, they
            would have produced a perfect score and learned nothing.
          </p>
        </div>
      )}

      {out?.training?.additive_leakage && (
        <div className="mt-5 rounded-md border border-failed/40 bg-failed-wash px-4 py-3">
          <p className="text-[13px] font-semibold text-failed">
            The target is derived from its own columns
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
            {out.training.additive_leakage.reason}
          </p>
          <p className="tabular mt-2 text-[12px] text-ink-soft">
            {out.training.additive_leakage.contributors
              .map((c) => `${c.column} ×${c.coefficient.toFixed(3)}`)
              .join("  ·  ")}
          </p>
          <p className="mt-2 text-[12px] leading-snug text-ink-faint">
            Coefficients near 1.0 mean the target is a sum. The score below is
            real but meaningless — remove the component columns, or predict
            something not derived from them.
          </p>
        </div>
      )}

      {out?.training?.sampled_from && (
        <p className="tabular mt-4 text-[12px] text-ink-faint">
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
        <p id="decision-analysis-summary" className="rise mt-5 max-w-3xl border-l-2 border-verified pl-4 text-[15px] leading-relaxed text-ink">
          {out.summary}
        </p>
      )}

      <div className="mt-7 grid gap-5 lg:grid-cols-[250px_1fr]">
        <div className="rise rise-1 space-y-5">
          <Panel title="How it ran">
            <RunTrace steps={out?.steps ?? []} />
          </Panel>

          {out?.cleaning?.changed && (
            <Panel
              title="Cleaned first"
              aside={
                <span className="tabular text-[12px] text-ink-faint">
                  {out.cleaning.rows_before.toLocaleString()} →{" "}
                  {out.cleaning.rows_after.toLocaleString()} rows
                </span>
              }
            >
              <ul className="space-y-2.5">
                {out.cleaning.actions.map((a) => (
                  <li key={a.action}>
                    <div className="text-[13px] font-medium">
                      {CLEANING_TITLES[a.action] ?? a.action}
                      {a.rows_affected > 0 && (
                        <span className="tabular ml-1.5 text-ink-faint">
                          {a.rows_affected.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] leading-snug text-ink-faint">{a.detail}</p>
                    {a.columns.length > 0 && (
                      <p className="tabular text-[12px] text-ink-soft">
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
              <div className="grid grid-cols-2 gap-4">
                <Metric label="Train rows" value={out.training.n_train.toLocaleString()} />
                <Metric label="Test rows" value={out.training.n_test.toLocaleString()} />
                <Metric label="Features" value={out.training.features_used.length} />
                <Metric label="Dropped" value={out.training.features_dropped.length} />
              </div>
              {out.training.features_dropped.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-rule pt-3">
                  {out.training.features_dropped.map((d) => (
                    <li key={d.column} className="text-[12px] leading-snug text-ink-faint">
                      <span className="tabular text-ink-soft">{d.column}</span> — {d.reason}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>

        <div className="rise rise-2 space-y-5">
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
                  <span className="tabular text-[12px] text-ink-faint">
                    {quality.gate_metric} {quality.gate_value?.toFixed(4)}
                  </span>
                }
              >
                <QualityChecks quality={quality} />
                {quality.dead_features.length > 0 && (
                  <p className="mt-3 border-t border-rule pt-3 text-[12px] leading-snug text-ink-faint">
                    Contributing almost nothing: {" "}
                    <span className="tabular">{quality.dead_features.join(", ")}</span>
                  </p>
                )}
              </Panel>
            </div>
          )}

          {out?.reflection && (
            <Panel
              title="Decision"
              aside={
                <span className="tabular text-[12px] text-ink-faint">
                  {ACTION_COPY[out.reflection.action] ?? out.reflection.action}
                </span>
              }
            >
              <p className="text-[14px] leading-relaxed text-ink-soft">
                {out.reflection.reasoning}
              </p>
            </Panel>
          )}

          {attempts.length > 1 && (
            <Panel
              title="Attempts"
              aside={
                <span className="text-[11px] text-ink-faint">
                  retries are judged on the gate metric
                </span>
              }
            >
              <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-ink-faint">
                    <th className="pb-1.5 font-medium min-w-[50px]">Round</th>
                    <th className="pb-1.5 font-medium min-w-[100px]">Model</th>
                    <th className="pb-1.5 font-medium min-w-[150px]">Excluded</th>
                    <th className="pb-1.5 text-right font-medium min-w-[80px]">Decided on</th>
                    <th className="pb-1.5 text-right font-medium min-w-[80px]">Headline</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {attempts.map((a) => (
                    <tr key={a.round} className="border-t border-rule">
                      <td className="py-1.5">{a.round}</td>
                      <td className="py-1.5">{a.best_model}</td>
                      <td className="py-1.5 text-ink-faint">
                        {a.excluded_features.length ? a.excluded_features.join(", ") : "—"}
                      </td>
                      <td className="py-1.5 text-right">
                        {a.gate_value != null ? (
                          <>
                            <span className="text-ink-faint">{a.gate_metric} </span>
                            {a.gate_value.toFixed(4)}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-1.5 text-right text-ink-faint">
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
                  <tr className="text-left text-[11px] uppercase tracking-wider text-ink-faint">
                    <th className="pb-1.5 font-medium min-w-[120px]">Model</th>
                    <th className="pb-1.5 text-right font-medium min-w-[80px]">Metric</th>
                    <th className="pb-1.5 text-right font-medium min-w-[80px]">Seconds</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {run.experiments.map((e) => (
                    <tr key={e.model_name} className="border-t border-rule">
                      <td className="py-1.5">
                        {e.model_name}
                        {e.is_selected && (
                          <span className="ml-2 rounded bg-verified-wash px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-verified">
                            chosen
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right">
                        {e.primary_metric} {e.primary_metric_value?.toFixed(4)}
                      </td>
                      <td className="py-1.5 text-right text-ink-faint">
                        {e.train_seconds?.toFixed(2)}
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
              <p className="text-[14px] leading-relaxed text-ink-soft">{out.plan.rationale}</p>
            </Panel>
          )}
        </div>
      </div>

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
