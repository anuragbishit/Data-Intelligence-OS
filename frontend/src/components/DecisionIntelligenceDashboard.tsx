import type { AnalysisRun, DataHealth, ScenarioResult } from "../api";
import { Panel } from "./shell";

function numberText(value: number | null | undefined, digits = 3) {
  return value == null || !Number.isFinite(value)
    ? "Not available"
    : value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function changeText(scenario: ScenarioResult) {
  const { impact, task_type: taskType } = scenario;
  if (taskType === "regression") {
    return `Mean predicted value changed from ${numberText(scenario.baseline_result.mean_prediction)} to ${numberText(scenario.scenario_result.mean_prediction)} (${numberText(impact.absolute_change)} absolute).`;
  }
  if (impact.focus_class != null) {
    return `Predicted class ${String(impact.focus_class)} changed from ${numberText(impact.baseline_focus_class_rate_percent, 1)}% to ${numberText(impact.scenario_focus_class_rate_percent, 1)}% (${numberText(impact.absolute_change_percentage_points, 2)} percentage points).`;
  }
  return `${impact.changed_prediction_count.toLocaleString()} of ${scenario.data_scope.rows_evaluated.toLocaleString()} predicted labels changed (${numberText(impact.changed_prediction_rate_percent, 1)}%).`;
}

function featureChangeText(scenario: ScenarioResult) {
  const { feature, operation, requested_value: value } = scenario.feature_change;
  const labels: Record<string, string> = {
    increase_percent: "increased by",
    decrease_percent: "decreased by",
    add: "increased by",
    subtract: "decreased by",
    multiply: "multiplied by",
    divide: "divided by",
    set: "set to",
  };
  const suffix = operation.endsWith("percent") ? "%" : "";
  return `${feature} ${labels[operation] ?? operation} ${String(value)}${suffix}`;
}

export function DecisionIntelligenceDashboard({
  run,
  dataHealth,
  scenario,
}: {
  run: AnalysisRun;
  dataHealth: DataHealth | null;
  scenario: ScenarioResult;
}) {
  const output = run.output_payload;
  const quality = output?.quality;
  const training = output?.training;
  const topFeature = output?.explanation?.features[0];
  const selectedModel = run.experiments.find((experiment) => experiment.is_selected);
  const operation = featureChangeText(scenario);
  const scenarioImpact = changeText(scenario);
  const failedChecks = quality?.checks.filter((check) => !check.passed).map((check) => check.detail) ?? [];
  const risks = [
    ...(quality?.reasons ?? []),
    ...failedChecks,
    ...(training?.leaked_features?.length
      ? [`${training.leaked_features.length} leakage feature(s) were removed before training.`]
      : []),
    ...(training?.additive_leakage ? [training.additive_leakage.reason] : []),
    ...(dataHealth?.findings.map((finding) => finding.message) ?? []),
    ...(scenario.data_scope.sampled
      ? [`Scenario predictions were sampled: ${scenario.data_scope.rows_evaluated.toLocaleString()} of ${scenario.data_scope.rows_scanned.toLocaleString()} scanned rows were evaluated.`]
      : []),
    ...(scenario.data_scope.row_read_limit_reached
      ? [`The scenario reached its ${scenario.data_scope.row_read_limit.toLocaleString()}-row read limit.`]
      : []),
    ...(!dataHealth ? ["Data Health could not be loaded for this run."] : []),
  ].filter((risk, index, all) => all.indexOf(risk) === index);
  const confidence = quality?.verdict === "strong"
    ? "Higher model reliability"
    : quality?.verdict === "acceptable"
      ? "Moderate model reliability"
      : quality?.verdict === "weak"
        ? "Low model reliability"
        : "Reliability not assessed";
  const topMetrics = Object.entries(selectedModel?.metrics ?? {}).slice(0, 4);
  const datasetDescription = dataHealth
    ? `${dataHealth.dataset.rows.toLocaleString()} rows, ${dataHealth.dataset.columns} columns, ${dataHealth.dataset.duplicate_rows.toLocaleString()} duplicates`
    : "Dataset profile unavailable";
  const healthDescription = dataHealth
    ? `${dataHealth.score}/100 (${dataHealth.status.replace(/_/g, " ")}); completeness ${numberText(dataHealth.metrics.completeness, 1)}%, validity ${numberText(dataHealth.metrics.validity, 1)}%`
    : "Not available";
  const modelDescription = selectedModel
    ? `${selectedModel.model_name}; ${selectedModel.primary_metric} ${numberText(selectedModel.primary_metric_value, 4)}; quality verdict ${quality?.verdict ?? "not available"}`
    : `Quality verdict ${quality?.verdict ?? "not available"}`;
  const featureDescription = topFeature
    ? `${topFeature.feature}; ${output?.explanation?.method ?? "importance"} importance ${numberText(topFeature.importance, 4)}`
    : "No feature-importance evidence was returned";
  const target = training?.target_column ?? "the selected target";
  const reliabilityEvidence = quality
    ? `${quality.verdict} verdict${quality.gate_metric ? `; ${quality.gate_metric} ${numberText(quality.gate_value, 4)}` : ""}`
    : "no model quality verdict was returned";
  const decisionWhy = scenario.task_type === "classification"
    ? `For ${target}, ${operation} changed the predicted class rates by ${numberText(scenario.impact.absolute_change_percentage_points, 2)} percentage points for class ${String(scenario.impact.focus_class ?? "not specified")}; ${scenario.impact.changed_prediction_count.toLocaleString()} of ${scenario.data_scope.rows_evaluated.toLocaleString()} evaluated labels changed. The model has a ${reliabilityEvidence}, so this is a sensitivity signal to validate, not a measured business outcome.`
    : `For ${target}, ${operation} shifted the mean prediction by ${numberText(scenario.impact.absolute_change)} (${scenario.impact.percentage_change == null ? "relative change unavailable at a zero baseline" : `${numberText(scenario.impact.percentage_change, 2)}%`}) across ${scenario.data_scope.rows_evaluated.toLocaleString()} evaluated rows. The model has a ${reliabilityEvidence}, so this is a sensitivity signal to validate, not a measured business outcome.`;
  const evidenceParts = [
    `Dataset profile: ${datasetDescription}`,
    dataHealth
      ? `Data Health: ${healthDescription}; ${dataHealth.findings.length} reported finding(s)`
      : "Data Health evidence unavailable",
    `Selected model: ${modelDescription}`,
    `Top measured feature: ${featureDescription}`,
    `Scenario: ${operation}; ${scenario.feature_change.rows_changed.toLocaleString()} feature values changed; ${scenario.data_scope.rows_evaluated.toLocaleString()} paired rows evaluated${scenario.data_scope.sampled ? ` from ${scenario.data_scope.rows_scanned.toLocaleString()} scanned` : ""}`,
  ];
  const decisionEvidence = evidenceParts.join(". ") + ".";

  return (
    <Panel
      title="Decision Intelligence"
      aside={<span className="text-[11px] text-ink-faint">Evidence-led · model sensitivity, not causality</span>}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
        <span className="text-[11px] font-semibold uppercase text-verified">Calculated data</span>
        <span className="tabular text-[12px] text-ink-soft">{confidence}</span>
      </div>

      <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
        <section>
          <h3 className="text-[13px] font-semibold">Key finding</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
            {topFeature
              ? `${topFeature.feature} is the highest-ranked measured model driver (${numberText(topFeature.importance, 4)} ${output?.explanation?.method ?? "importance"}). Under the selected scenario, ${scenarioImpact.toLowerCase()}`
              : scenarioImpact}
          </p>
        </section>

        <section>
          <h3 className="text-[13px] font-semibold">Business / decision impact</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
            The model's predicted outcome changes across {scenario.data_scope.rows_evaluated.toLocaleString()} evaluated records. This can inform what to validate next; it does not estimate real-world outcomes, customer retention, or financial impact.
          </p>
        </section>

        <section className="md:col-span-2">
          <h3 className="text-[13px] font-semibold">Scenario impact</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
            {operation}: {scenarioImpact} {scenario.task_type === "classification" && `${scenario.impact.changed_prediction_count.toLocaleString()} predicted labels changed (${numberText(scenario.impact.changed_prediction_rate_percent, 1)}%).`}
          </p>
        </section>

        <section className="md:col-span-2">
          <h3 className="text-[13px] font-semibold">Supporting evidence</h3>
          <ul className="mt-2 divide-y divide-rule border-y border-rule">
            <EvidenceLink href="#decision-data-health" label="Dataset" value={datasetDescription} />
            <EvidenceLink href="#decision-data-health" label="Data Health" value={healthDescription} />
            <EvidenceLink href="#decision-quality-evidence" label="Model / quality" value={modelDescription} />
            <EvidenceLink href="#decision-feature-evidence" label="Feature importance" value={featureDescription} />
            <EvidenceLink
              href="#decision-analysis-summary"
              label="Analysis"
              value={training ? `${training.target_column}; ${training.n_train.toLocaleString()} training and ${training.n_test.toLocaleString()} test rows` : "Training evidence unavailable"}
            />
            <EvidenceLink href="#decision-what-if" label="Scenario" value={`${operation}; ${scenarioImpact}`} />
          </ul>
          {topMetrics.length > 0 && (
            <p className="mt-2 text-[11px] text-ink-faint">
              Selected model metrics: {topMetrics.map(([name, value]) => `${name} ${numberText(value, 4)}`).join(" · ")}
              {" · "}<a className="text-verified underline underline-offset-2" href="#decision-model-evidence">View model comparison</a>
            </p>
          )}
        </section>

        <section className="md:col-span-2">
          <h3 className="text-[13px] font-semibold">Confidence / risk</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-faint">
            Reliability is derived from the existing quality verdict, not a probability estimate.
          </p>
          {risks.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {risks.map((risk) => <li key={risk} className="text-[12px] leading-relaxed text-weak">{risk}</li>)}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-ink-soft">No failed model checks or reported Data Health findings were returned for this run.</p>
          )}
        </section>

        <section className="md:col-span-2 border-t border-rule pt-4">
          <p className="text-[11px] font-semibold uppercase text-weak">AI interpretation · recommended action</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
            {scenario.ai_recommendation ?? "No AI recommendation was returned. Use the calculated evidence above; do not treat the scenario as a causal estimate."}
          </p>
          {scenario.ai_explanation && (
            <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
              {scenario.ai_explanation}
            </p>
          )}
        </section>

        <section className="md:col-span-2">
          <h3 className="text-[13px] font-semibold">Decision explanation</h3>
          <dl className="mt-2 grid gap-2 text-[12px] leading-relaxed sm:grid-cols-[150px_1fr]">
            <dt className="text-ink-faint">What was observed?</dt><dd className="text-ink-soft">{target}: {scenarioImpact}</dd>
            <dt className="text-ink-faint">Why does it matter?</dt><dd className="text-ink-soft">{decisionWhy}</dd>
            <dt className="text-ink-faint">What evidence supports it?</dt><dd className="text-ink-soft">{decisionEvidence}</dd>
            <dt className="text-ink-faint">What happens under the scenario?</dt><dd className="text-ink-soft">{operation}; {scenarioImpact}</dd>
            <dt className="text-ink-faint">What action could be considered?</dt><dd className="text-ink-soft">{scenario.ai_recommendation ?? "No AI action was returned; validate the model and evidence before making an operational change."}</dd>
          </dl>
        </section>
      </div>
    </Panel>
  );
}

function EvidenceLink({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <li className="grid gap-1 py-2 sm:grid-cols-[150px_1fr]">
      <a className="text-[11px] font-semibold text-verified underline underline-offset-2" href={href}>{label}</a>
      <span className="text-[12px] leading-relaxed text-ink-soft">{value}</span>
    </li>
  );
}
