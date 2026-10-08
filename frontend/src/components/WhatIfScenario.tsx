import { useState, type FormEvent } from "react";
import { api, type ScenarioOperation, type ScenarioResult } from "../api";
import { Button, ErrorNote, Panel } from "./shell";

const OPERATIONS: { value: ScenarioOperation; label: string }[] = [
  { value: "increase_percent", label: "Increase by %" },
  { value: "decrease_percent", label: "Decrease by %" },
  { value: "set", label: "Set to value" },
  { value: "add", label: "Add" },
  { value: "subtract", label: "Subtract" },
  { value: "multiply", label: "Multiply by" },
  { value: "divide", label: "Divide by" },
];

function numberText(value: number | null | undefined, digits = 3) {
  return value == null || !Number.isFinite(value)
    ? "Not available"
    : value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function distributionText(result: ScenarioResult["baseline_result"]) {
  return result.predicted_class_distribution
    ?.map((item) => `${String(item.class)}: ${numberText(item.rate_percent, 1)}%`)
    .join(" · ") ?? "No class distribution returned.";
}

function FeatureEvidence({ result }: { result: ScenarioResult }) {
  const evidence = result.feature_change;
  if (evidence.baseline.kind === "numeric") {
    return (
      <p className="mt-2 text-[12px] text-ink-faint">
        {evidence.feature} mean: {numberText(evidence.baseline.mean)} → {numberText(evidence.scenario.mean)}; observed range {numberText(evidence.baseline.minimum)} to {numberText(evidence.baseline.maximum)}.
      </p>
    );
  }

  return (
    <p className="mt-2 text-[12px] text-ink-faint">
      {evidence.feature} categories changed on {evidence.rows_changed.toLocaleString()} rows.
      {evidence.unseen_category ? " The chosen category was not present in the evaluated rows." : ""}
    </p>
  );
}

export function WhatIfScenario({
  runId,
  features,
  initialFeature,
  onResult,
  history,
}: {
  runId: string;
  features: string[];
  initialFeature?: string;
  onResult?: (result: ScenarioResult | null) => void;
  history?: ScenarioResult[];
}) {
  const [feature, setFeature] = useState(
    initialFeature && features.includes(initialFeature) ? initialFeature : features[0] ?? "",
  );
  const [operation, setOperation] = useState<ScenarioOperation>("increase_percent");
  const [value, setValue] = useState("10");
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!feature || !value.trim() || busy) return;

    const scenarioValue = operation === "set" ? value.trim() : Number(value);
    if (typeof scenarioValue === "number" && !Number.isFinite(scenarioValue)) {
      setError("Enter a valid number for this operation.");
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    onResult?.(null);
    try {
      const scenarioResult = await api.runScenario(runId, {
        feature,
        operation,
        value: scenarioValue,
      });
      setResult(scenarioResult);
      onResult?.(scenarioResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scenario could not be evaluated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="What-if scenario" aside={<span className="text-[11px] text-ink-faint">Saved model · no retraining</span>}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[minmax(140px,1fr)_minmax(145px,0.9fr)_minmax(110px,0.65fr)_auto] sm:items-end">
        <label className="block text-[12px] text-ink-soft">
          Feature
          <select
            value={feature}
            onChange={(event) => setFeature(event.target.value)}
            className="mt-1 block w-full rounded border border-rule-strong bg-surface px-2.5 py-2 text-[13px] text-ink"
          >
            {features.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="block text-[12px] text-ink-soft">
          Change
          <select
            value={operation}
            onChange={(event) => setOperation(event.target.value as ScenarioOperation)}
            className="mt-1 block w-full rounded border border-rule-strong bg-surface px-2.5 py-2 text-[13px] text-ink"
          >
            {OPERATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="block text-[12px] text-ink-soft">
          Value
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            inputMode={operation === "set" ? "text" : "decimal"}
            className="mt-1 block w-full rounded border border-rule-strong bg-surface px-2.5 py-2 text-[13px] text-ink"
            placeholder={operation === "set" ? "e.g. 4 or premium" : "e.g. 10"}
          />
        </label>
        <Button type="submit" disabled={!feature || !value.trim() || busy}>
          {busy ? "Calculating…" : "Run scenario"}
        </Button>
      </form>

      <p className="mt-2 text-[11px] text-ink-faint">
        Predictions use the saved model on the same rows before and after the change. This measures model sensitivity, not a causal effect.
      </p>

      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      {result && (
        <div className="mt-5 border-t border-rule pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[14px] font-semibold">Prediction comparison</h3>
            <span className="tabular text-[11px] text-ink-faint">
              {result.data_scope.rows_evaluated.toLocaleString()} rows evaluated
              {result.data_scope.sampled ? ` from ${result.data_scope.rows_scanned.toLocaleString()} scanned` : " · full available dataset"}
            </span>
          </div>

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase text-ink-faint">Baseline</p>
              {result.task_type === "regression" ? (
                <p className="tabular mt-1 text-[17px] font-semibold">Mean {numberText(result.baseline_result.mean_prediction)}</p>
              ) : (
                <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{distributionText(result.baseline_result)}</p>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase text-ink-faint">Scenario</p>
              {result.task_type === "regression" ? (
                <p className="tabular mt-1 text-[17px] font-semibold">Mean {numberText(result.scenario_result.mean_prediction)}</p>
              ) : (
                <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{distributionText(result.scenario_result)}</p>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-3 border-t border-rule pt-3 sm:grid-cols-3">
            {result.task_type === "regression" ? (
              <>
                <div><p className="text-[11px] text-ink-faint">Absolute change in mean</p><p className="tabular text-[14px] font-semibold">{numberText(result.impact.absolute_change)}</p></div>
                <div><p className="text-[11px] text-ink-faint">Relative change</p><p className="tabular text-[14px] font-semibold">{result.impact.percentage_change == null ? "Not defined from zero baseline" : `${numberText(result.impact.percentage_change, 2)}%`}</p></div>
              </>
            ) : (
              <>
                <div><p className="text-[11px] text-ink-faint">{result.impact.focus_class == null ? "Changed predicted labels" : `Predicted ${String(result.impact.focus_class)} rate change`}</p><p className="tabular text-[14px] font-semibold">{result.impact.focus_class == null ? `${result.impact.changed_prediction_count.toLocaleString()} (${numberText(result.impact.changed_prediction_rate_percent, 1)}%)` : `${numberText(result.impact.absolute_change_percentage_points, 2)} percentage points`}</p></div>
                <div><p className="text-[11px] text-ink-faint">Relative rate change</p><p className="tabular text-[14px] font-semibold">{result.impact.percentage_change == null ? "Not defined from zero baseline" : `${numberText(result.impact.percentage_change, 2)}%`}</p></div>
                <div><p className="text-[11px] text-ink-faint">Predictions changed</p><p className="tabular text-[14px] font-semibold">{result.impact.changed_prediction_count.toLocaleString()} ({numberText(result.impact.changed_prediction_rate_percent, 1)}%)</p></div>
              </>
            )}
          </div>

          <FeatureEvidence result={result} />
          {result.data_scope.row_read_limit_reached && (
            <p className="mt-2 text-[11px] text-weak">The input row-read limit was reached; results describe only rows read by this interactive run.</p>
          )}
          <div className="mt-4 border-l-2 border-verified pl-3">
            <p className="text-[11px] font-semibold uppercase text-ink-faint">AI explanation</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
              {result.ai_explanation ?? "The model computed the scenario, but the AI explanation is currently unavailable."}
            </p>
          </div>
        </div>
      )}

      {history && history.length > 0 && (
        <div className="mt-6 border-t border-weak pt-4">
          <h4 className="text-[13px] font-semibold text-ink-soft mb-2">Scenario History</h4>
          <div className="space-y-3">
            {history.map((h, i) => (
              <div key={i} className="bg-weak rounded p-3 text-[12px]">
                <div className="font-medium text-ink">
                  {h.feature_change.operation} {h.feature_change.feature} by {h.feature_change.requested_value}
                </div>
                <div className="text-ink-soft mt-1">
                  {h.task_type === 'classification' ? (
                     <span>Class distribution changed to {distributionText(h.scenario_result)}</span>
                  ) : (
                     <span>Mean prediction shifted by {numberText(h.impact.absolute_change)} ({numberText(h.impact.percentage_change, 2)}%)</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </Panel>
  );
}
