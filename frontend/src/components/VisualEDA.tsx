import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  api,
  type CategoricalDistribution,
  type EdaResponse,
  type NumericDistribution,
} from "../api";
import { ErrorNote, Metric, Panel } from "./shell";

interface Props {
  projectId: string;
  datasetId: string;
}

export function VisualEDA({ projectId, datasetId }: Props) {
  const [data, setData] = useState<EdaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"distributions" | "correlations" | "missingness">("distributions");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    api
      .getDatasetEda(projectId, datasetId)
      .then((res) => {
        if (!active) return;
        setData(res);
        const firstCol = Object.keys(res.distributions)[0] || "";
        setSelectedColumn(firstCol);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load Exploratory Data Analysis.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId, datasetId]);

  if (loading) {
    return (
      <Panel title="Visual Exploratory Data Analysis (EDA)">
        <div className="py-10 text-center text-[13px] text-ink-faint animate-pulse">
          Computing statistical distributions and correlation matrices…
        </div>
      </Panel>
    );
  }

  if (error || !data) {
    return (
      <Panel title="Visual Exploratory Data Analysis (EDA)">
        <ErrorNote>{error || "No EDA data available."}</ErrorNote>
      </Panel>
    );
  }

  const columns = Object.keys(data.distributions);
  const dist = selectedColumn ? data.distributions[selectedColumn] : null;

  return (
    <Panel
      title="Visual Exploratory Data Analysis (EDA)"
      aside={
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab("distributions")}
            className={`rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${
              activeTab === "distributions"
                ? "bg-ink text-surface"
                : "text-ink-soft hover:bg-paper"
            }`}
          >
            Distributions
          </button>
          <button
            onClick={() => setActiveTab("correlations")}
            className={`rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${
              activeTab === "correlations"
                ? "bg-ink text-surface"
                : "text-ink-soft hover:bg-paper"
            }`}
          >
            Correlation Heatmap
          </button>
          <button
            onClick={() => setActiveTab("missingness")}
            className={`rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${
              activeTab === "missingness"
                ? "bg-ink text-surface"
                : "text-ink-soft hover:bg-paper"
            }`}
          >
            Missingness
          </button>
        </div>
      }
    >
      {/* TAB 1: DISTRIBUTIONS */}
      {activeTab === "distributions" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="text-[12px] font-medium text-ink-soft">Select Column:</label>
              <select
                value={selectedColumn}
                onChange={(e) => setSelectedColumn(e.target.value)}
                className="rounded border border-rule-strong bg-surface px-2.5 py-1 text-[13px] font-medium text-ink focus:border-verified focus:outline-none"
              >
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c} ({data.distributions[c].type})
                  </option>
                ))}
              </select>
            </div>
            {dist && (
              <span className="text-[12px] text-ink-faint">
                Total observed: {dist.total_count.toLocaleString()} rows
              </span>
            )}
          </div>

          {dist && dist.type === "numeric" && (
            <div>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Metric label="Mean" value={(dist as NumericDistribution).mean.toFixed(2)} />
                <Metric label="Median" value={(dist as NumericDistribution).median.toFixed(2)} />
                <Metric label="Std Dev" value={(dist as NumericDistribution).std.toFixed(2)} />
                <Metric label="Min" value={(dist as NumericDistribution).min.toFixed(2)} />
                <Metric label="Max" value={(dist as NumericDistribution).max.toFixed(2)} />
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={(dist as NumericDistribution).bins}
                    margin={{ top: 10, right: 10, left: 0, bottom: 25 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-rule/50" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      angle={-25}
                      textAnchor="end"
                      interval={0}
                      stroke="currentColor"
                      className="text-ink-faint"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="currentColor"
                      className="text-ink-faint"
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const bin = payload[0].payload;
                        return (
                          <div className="rounded border border-rule bg-surface p-2 shadow-sm text-[12px]">
                            <p className="font-semibold text-ink">Range: {bin.label}</p>
                            <p className="text-ink-soft">Count: {bin.count.toLocaleString()} rows</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {dist && dist.type === "categorical" && (
            <div>
              <p className="text-[12px] text-ink-faint mb-3">
                Top categories for <span className="font-semibold text-ink">{selectedColumn}</span> ({(dist as CategoricalDistribution).total_unique} distinct values):
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={(dist as CategoricalDistribution).categories}
                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="text-rule/50" />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="currentColor" className="text-ink-faint" />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tick={{ fontSize: 11 }}
                      width={90}
                      stroke="currentColor"
                      className="text-ink-faint"
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const cat = payload[0].payload;
                        return (
                          <div className="rounded border border-rule bg-surface p-2 shadow-sm text-[12px]">
                            <p className="font-semibold text-ink">{cat.name}</p>
                            <p className="text-ink-soft">
                              {cat.count.toLocaleString()} rows ({cat.pct}%)
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CORRELATION HEATMAP */}
      {activeTab === "correlations" && (
        <div>
          {data.correlation_columns.length < 2 ? (
            <p className="py-8 text-center text-[13px] text-ink-faint">
              Not enough numeric columns available to compute a correlation matrix.
            </p>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3 text-[12px] text-ink-faint">
                <span>Pearson correlation coefficient r ∈ [-1.0, 1.0]</span>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded bg-blue-500" /> -1.0 Negative
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded bg-slate-200" /> 0.0 None
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded bg-amber-500" /> +1.0 Positive
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="border-collapse text-[11px] font-mono">
                  <thead>
                    <tr>
                      <th className="p-1 text-left font-sans font-medium text-ink-faint"></th>
                      {data.correlation_columns.map((col) => (
                        <th
                          key={col}
                          className="p-1.5 text-center font-medium text-ink-soft max-w-[70px] truncate"
                          title={col}
                        >
                          {col.length > 7 ? col.slice(0, 6) + "…" : col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.correlation_columns.map((rowCol) => (
                      <tr key={rowCol}>
                        <td className="p-1.5 font-sans font-medium text-ink-soft truncate max-w-[120px]" title={rowCol}>
                          {rowCol}
                        </td>
                        {data.correlation_columns.map((colCol) => {
                          const cell = data.correlation_matrix.find(
                            (c) => c.x === colCol && c.y === rowCol
                          );
                          const r = cell ? cell.correlation : 0;
                          
                          // Dynamic Heatmap color calculation
                          let bgColor = "rgb(241 245 249)";
                          let textColor = "#1e293b";
                          if (r > 0) {
                            const opacity = Math.min(1, Math.max(0.1, r));
                            bgColor = `rgba(245, 158, 11, ${opacity})`;
                            if (r > 0.5) textColor = "#ffffff";
                          } else if (r < 0) {
                            const opacity = Math.min(1, Math.max(0.1, Math.abs(r)));
                            bgColor = `rgba(59, 130, 246, ${opacity})`;
                            if (r < -0.5) textColor = "#ffffff";
                          }

                          return (
                            <td
                              key={colCol}
                              style={{ backgroundColor: bgColor, color: textColor }}
                              className="p-1.5 text-center font-semibold rounded border border-surface cursor-default transition-all"
                              title={`${rowCol} vs ${colCol}: r = ${r.toFixed(3)}`}
                            >
                              {r === 1 ? "1.00" : r.toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MISSINGNESS PROFILE */}
      {activeTab === "missingness" && (
        <div>
          <p className="text-[12px] text-ink-faint mb-3">
            Completeness and missing value ratios across all columns ({data.rows.toLocaleString()} total rows):
          </p>
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {data.missingness.map((m) => (
              <div key={m.column} className="flex items-center gap-3 text-[12px]">
                <span className="w-36 truncate font-medium text-ink" title={m.column}>
                  {m.column}
                </span>
                <span className="w-16 font-mono text-[11px] text-ink-faint">
                  {m.dtype}
                </span>
                <div className="h-2.5 flex-1 rounded-full bg-paper overflow-hidden flex">
                  <div
                    className="h-full bg-verified"
                    style={{ width: `${m.present_pct}%` }}
                    title={`Present: ${m.present_pct}%`}
                  />
                  {m.missing_pct > 0 && (
                    <div
                      className="h-full bg-failed"
                      style={{ width: `${m.missing_pct}%` }}
                      title={`Missing: ${m.missing_pct}%`}
                    />
                  )}
                </div>
                <span className="w-20 text-right font-mono text-[11px] text-ink-soft">
                  {m.missing_count === 0 ? "100% full" : `${m.missing_pct}% null`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
