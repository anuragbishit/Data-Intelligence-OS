import { useEffect, useState, type FormEvent } from "react";
import {
  api,
  type FeatureSchemaItem,
  type LivePredictionResponse,
  type PredictionSchemaResponse,
} from "../api";
import { Button, ErrorNote, Panel } from "./shell";

interface Props {
  runId: string;
}

export function LivePredictionPlayground({ runId }: Props) {
  const [schema, setSchema] = useState<PredictionSchemaResponse | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LivePredictionResponse | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    api
      .getPredictionSchema(runId)
      .then((data) => {
        if (!active) return;
        setSchema(data);
        const defaults: Record<string, unknown> = {};
        for (const item of data.features) {
          defaults[item.name] = item.default_value;
        }
        setFormData(defaults);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load prediction schema.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [runId]);

  function handleInputChange(name: string, value: unknown) {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleReset() {
    if (!schema) return;
    const defaults: Record<string, unknown> = {};
    for (const item of schema.features) {
      defaults[item.name] = item.default_value;
    }
    setFormData(defaults);
    setResult(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!schema || predicting) return;

    setPredicting(true);
    setError(null);
    try {
      const res = await api.predictSingle(runId, formData);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate prediction.");
    } finally {
      setPredicting(false);
    }
  }

  if (loading) {
    return (
      <Panel title="Live Prediction Playground" aside={<span className="text-[11px] text-ink-faint">Instant Inference</span>}>
        <div className="py-8 text-center text-[13px] text-ink-faint animate-pulse">
          Loading model inputs and schema…
        </div>
      </Panel>
    );
  }

  if (error && !schema) {
    return (
      <Panel title="Live Prediction Playground">
        <ErrorNote>{error}</ErrorNote>
      </Panel>
    );
  }

  if (!schema || schema.features.length === 0) {
    return null;
  }

  return (
    <Panel
      title="Live Prediction Playground"
      aside={
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-verified">
            Real Model Inference
          </span>
          <span className="text-[11px] text-ink-faint">· Single-record test</span>
        </div>
      }
    >
      <p className="text-[12px] leading-relaxed text-ink-faint mb-4">
        Input custom values to test how the trained pipeline predicts on a single record in real time. Features are pre-filled with baseline dataset medians.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-h-[360px] overflow-y-auto pr-1">
          {schema.features.map((item: FeatureSchemaItem) => (
            <div key={item.name} className="rounded border border-rule bg-paper/40 p-2.5">
              <div className="flex items-baseline justify-between gap-1 mb-1">
                <label className="text-[12px] font-semibold text-ink truncate" title={item.name}>
                  {item.name}
                </label>
                <span className="text-[10px] uppercase font-mono text-ink-faint">
                  {item.type}
                </span>
              </div>

              {item.type === "numeric" ? (
                <div>
                  <input
                    type="number"
                    step={item.step ?? "any"}
                    min={item.min_value ?? undefined}
                    max={item.max_value ?? undefined}
                    value={formData[item.name] !== undefined ? String(formData[item.name]) : ""}
                    onChange={(e) => handleInputChange(item.name, e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full rounded border border-rule-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink font-mono focus:border-verified focus:outline-none"
                    placeholder={`e.g. ${item.default_value}`}
                  />
                  {item.min_value != null && item.max_value != null && (
                    <div className="mt-1 flex justify-between text-[10px] text-ink-faint">
                      <span>min: {item.min_value}</span>
                      <span>max: {item.max_value}</span>
                    </div>
                  )}
                </div>
              ) : (
                <select
                  value={String(formData[item.name] ?? "")}
                  onChange={(e) => handleInputChange(item.name, e.target.value)}
                  className="w-full rounded border border-rule-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink focus:border-verified focus:outline-none"
                >
                  {(item.options || ["Default"]).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
          <div className="flex gap-2">
            <Button type="submit" disabled={predicting}>
              {predicting ? "Computing Prediction…" : "Run Live Prediction"}
            </Button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded border border-rule px-3 py-1.5 text-[12px] font-medium text-ink-faint hover:bg-paper hover:text-ink"
            >
              Reset to Defaults
            </button>
          </div>
          <span className="text-[11px] text-ink-faint">
            Target: <strong className="text-ink">{schema.target_column}</strong> ({schema.task_type})
          </span>
        </div>
      </form>

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {result && (
        <div className="mt-5 rounded-lg border border-verified/40 bg-verified-wash/30 p-4 transition-all">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule/50 pb-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Model Prediction Outcome
              </p>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="text-[22px] font-bold tracking-tight text-ink">
                  {result.prediction_display}
                </span>
                {result.confidence != null && (
                  <span className="rounded bg-verified-wash px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-verified">
                    {(result.confidence * 100).toFixed(1)}% confidence
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-ink-faint">Target Variable</span>
              <p className="text-[13px] font-medium text-ink">{result.target_column}</p>
            </div>
          </div>

          {result.probabilities && result.probabilities.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase text-ink-faint mb-1.5">
                Class Probability Distribution
              </p>
              <div className="space-y-1.5">
                {result.probabilities.map((p) => (
                  <div key={p.class_name} className="flex items-center gap-3 text-[12px]">
                    <span className="w-28 truncate font-medium text-ink" title={p.class_name}>
                      {p.class_name}
                    </span>
                    <div className="h-2 flex-1 rounded-full bg-paper overflow-hidden">
                      <div
                        className="h-full rounded-full bg-verified transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(2, p.percentage))}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono font-medium text-ink">
                      {p.percentage.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.feature_contributions.length > 0 && (
            <div className="mt-4 border-t border-rule/50 pt-3">
              <p className="text-[11px] font-semibold uppercase text-ink-faint mb-2">
                Local Feature Influences (Why this record received this outcome)
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {result.feature_contributions.slice(0, 6).map((c) => (
                  <div
                    key={c.feature}
                    className="flex items-center justify-between rounded border border-rule/60 bg-surface/70 px-2.5 py-1.5 text-[12px]"
                  >
                    <div className="truncate pr-2">
                      <span className="font-medium text-ink">{c.feature}</span>
                      <span className="ml-1 text-ink-faint font-mono">({String(c.value)})</span>
                    </div>
                    <span
                      className={`text-[11px] font-medium ${
                        c.direction === "positive"
                          ? "text-verified font-semibold"
                          : c.direction === "negative"
                          ? "text-weak font-semibold"
                          : "text-ink-faint"
                      }`}
                    >
                      {c.direction === "positive" ? "↑ pushes higher" : c.direction === "negative" ? "↓ pushes lower" : "· neutral"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
