import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type AnalysisRun,
  type DatasetSummary,
  type Profile,
  type Project,
} from "../api";
import { Chat } from "../components/Chat";
import { RunProgress } from "../components/RunProgress";
import { SkeletonCard, SkeletonLines } from "../components/Skeleton";
import { VisualEDA } from "../components/VisualEDA";
import { Button, ErrorNote, Metric, Panel } from "../components/shell";

const SEVERITY = {
  error: "bg-rose-50 text-rose-700 border-rose-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  info: "bg-slate-100 text-slate-600 border-slate-200",
} as const;

export function ProjectDetail() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const [project, setProject] = useState<Project | null>(null);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const dataset = datasets[0] ?? null;

  useEffect(() => {
    Promise.all([
      api.getProject(projectId),
      api.listDatasets(projectId),
      api.listRuns(projectId),
    ])
      .then(([p, d, r]) => {
        setProject(p);
        setDatasets(d);
        setRuns(r);
        if (d[0]) return api.getProfile(projectId, d[0].id).then(setProfile);
      })
      .catch((e) => setError(e.message));
  }, [projectId]);

  async function upload(file: File) {
    setBusy("Reading and profiling tabular data…");
    setError(null);
    try {
      const res = await api.uploadDataset(projectId, file);
      setDatasets((d) => [res.dataset, ...d.filter((x) => x.id !== res.dataset.id)]);
      setProfile(await api.getProfile(projectId, res.dataset.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    if (!dataset) return;
    setRunning(true);
    setError(null);
    try {
      const created = await api.startAnalysis(projectId, dataset.id, goal || undefined);
      navigate(`/runs/${created.id}`);
    } catch (e) {
      setError((e as Error).message);
      setRunning(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  if (error && !project) return <div className="mx-auto max-w-3xl p-6"><ErrorNote>{error}</ErrorNote></div>;
  if (!project) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <div className="mb-6 h-6 w-56 animate-pulse rounded bg-slate-200" />
        <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-[12px] text-slate-500 mb-2">
        <Link to="/" className="hover:text-slate-900 transition-colors flex items-center gap-1 font-semibold text-slate-600">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Projects
        </Link>
        <span className="text-slate-300">/</span>
        <span className="font-bold text-slate-900 truncate">{project.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[28px] sm:text-[32px] font-extrabold tracking-tight text-slate-900">
              {project.name}
            </h1>
            {dataset && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-50/80 backdrop-blur-sm px-3 py-1 text-[11px] font-bold text-teal-800 shadow-2xs">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulse" />
                Dataset Ready
              </span>
            )}
          </div>
          <p className="text-[13px] sm:text-[14px] text-slate-500 mt-1">
            Workspace · Autonomous profiling, AutoML candidate benchmarking & API generation
          </p>
        </div>
      </div>

      {error && <div className="mb-6"><ErrorNote>{error}</ErrorNote></div>}

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* Left Column: Data & Profiling */}
        <div className="rise rise-1 space-y-6">
          <Panel
            title="Tabular Dataset"
            aside={
              dataset && (
                <button
                  onClick={() => fileInput.current?.click()}
                  className="rounded-xl border border-slate-200/90 bg-white px-3 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs cursor-pointer"
                >
                  Replace File
                </button>
              )
            }
          >
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />

            {!dataset ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInput.current?.click()}
                className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200 overflow-hidden ${
                  isDragging
                    ? "border-teal-500 bg-teal-50/60 shadow-inner"
                    : "border-slate-300 hover:border-teal-500/60 bg-slate-50/40 hover:bg-white"
                }`}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-xs border border-slate-200/80 text-teal-600 mb-4 transition-transform group-hover:scale-105">
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <p className="text-[15px] font-bold text-slate-800">
                  {busy ? busy : "Upload your tabular dataset"}
                </p>
                <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-slate-500">
                  Drag and drop your CSV or TSV file here, or click to browse. Automatically detects headers, types, and nulls.
                </p>
                <div className="mt-5 flex items-center gap-2">
                  <span className="rounded-lg bg-white border border-slate-200/80 px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-2xs">CSV</span>
                  <span className="rounded-lg bg-white border border-slate-200/80 px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-2xs">TSV</span>
                  <span className="rounded-lg bg-white border border-slate-200/80 px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-2xs">TXT</span>
                  <span className="text-[11px] text-slate-400 font-medium">up to 100 MB</span>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-4 flex items-center gap-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 shadow-2xs">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="tabular truncate text-[15px] font-bold text-slate-900">
                      {dataset.original_filename}
                    </div>
                    <div className="text-[12px] text-slate-500 flex items-center gap-2 mt-0.5">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-500" />
                      <span>Loaded & profiled · Ready for autonomous modeling</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <Metric label="Total Rows" value={dataset.n_rows?.toLocaleString() ?? "—"} />
                  <Metric label="Columns" value={dataset.n_columns ?? "—"} />
                  <Metric
                    label="File Size"
                    value={`${(dataset.size_bytes / 1024).toFixed(0)} KB`}
                  />
                </div>
              </div>
            )}
          </Panel>

          {dataset && !profile && (
            <Panel title="Automated Profiler Findings">
              <SkeletonLines rows={4} />
            </Panel>
          )}

          {profile && (
            <Panel title="Automated Profiler Findings">
              <div className="mb-4 grid grid-cols-2 gap-3">
                <Metric label="Duplicate Rows" value={profile.duplicate_rows} />
                <Metric
                  label="Recommended Target"
                  value={profile.target_candidates[0]?.column ?? "Auto-detect"}
                />
              </div>

              {profile.warnings.length > 0 && (
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Data Quality Insights ({profile.warnings.length})
                  </div>
                  <ul className="space-y-2">
                    {profile.warnings.slice(0, 8).map((w, i) => (
                      <li key={i} className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-[12px] shadow-2xs">
                        <span className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${SEVERITY[w.severity]}`}>
                          {w.severity}
                        </span>
                        <span className="text-slate-700 leading-relaxed">
                          {w.column && <strong className="tabular text-slate-900 font-bold">{w.column}: </strong>}
                          {w.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          )}
        </div>

        {/* Right Column: Execution & Runs */}
        <div className="rise rise-2 space-y-6">
          <Panel title="Autonomous Analysis Engine">
            <label className="mb-2 block text-[13px] font-bold text-slate-800">
              Analysis Goal (Optional)
            </label>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Predict whether a customer churns, or forecast revenue"
              className="mb-3 w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 shadow-2xs transition-all"
            />

            {/* Quick Suggestion Chips */}
            <div className="mb-5 flex flex-wrap gap-1.5">
              {[
                "🎯 Predict primary target",
                "📉 Identify key churn drivers",
                "⚡ Benchmark candidate models",
                "🛡️ Scan data leakage",
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setGoal(chip.replace(/^[^\s]+\s/, ""))}
                  className="rounded-full border border-slate-200/80 bg-slate-50/80 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 transition-colors cursor-pointer shadow-2xs"
                >
                  {chip}
                </button>
              ))}
            </div>

            {running ? (
              <RunProgress />
            ) : (
              <div>
                <Button onClick={run} disabled={!dataset || !!busy} variant="primary">
                  {busy ? "Processing…" : "⚡ Run Autonomous Analysis"}
                </Button>
                {busy && (
                  <p className="mt-2.5 text-[12px] font-medium leading-snug text-teal-700">{busy}</p>
                )}
              </div>
            )}
          </Panel>

          <Chat projectId={projectId} hasDataset={!!dataset} />

          <Panel title={`Analysis Runs (${runs.length})`}>
            {runs.length === 0 ? (
              <p className="text-[13px] font-medium text-slate-400">
                No analyses run yet. Click "Run Autonomous Analysis" above to initiate the pipeline.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {runs.map((r) => {
                  const q = r.output_payload?.quality;
                  const target = r.output_payload?.plan?.target_column ?? "Analysis";
                  return (
                    <li key={r.id}>
                      <Link
                        to={`/runs/${r.id}`}
                        className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-3 py-3 hover:bg-slate-50 transition-colors group"
                      >
                        <div className="min-w-0">
                          <span className="tabular block truncate text-[13px] font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
                            {target}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500 capitalize">
                            {r.output_payload?.plan?.task_type ?? r.status}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span
                            className={`tabular block text-[13px] font-extrabold ${
                              r.status === "failed" ? "text-rose-600" : "text-teal-700"
                            }`}
                          >
                            {q ? `${q.gate_metric} ${q.gate_value.toFixed(3)}` : r.status}
                          </span>
                          {q?.verdict && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              {q.verdict}
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {dataset && (
        <div className="mt-8">
          <VisualEDA projectId={projectId} datasetId={dataset.id} />
        </div>
      )}
    </div>
  );
}
