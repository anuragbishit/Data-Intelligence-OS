import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type LLMCheck, type ProjectSummary } from "../api";
import { SkeletonCard } from "../components/Skeleton";
import { Button, ErrorNote, Empty } from "../components/shell";

const VERDICT = {
  strong: { label: "Strong Verdict", cls: "bg-teal-50 text-teal-700 border-teal-200/80" },
  acceptable: { label: "Acceptable", cls: "bg-teal-50 text-teal-700 border-teal-200/80" },
  weak: { label: "Needs Tuning", cls: "bg-amber-50 text-amber-700 border-amber-200/80" },
} as const;

function StatCard({
  value,
  label,
  sublabel,
  icon,
  accent = "slate",
}: {
  value: string | number;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  accent?: "slate" | "teal" | "amber" | "indigo";
}) {
  const accentClasses = {
    slate: "from-slate-500/10 to-transparent border-slate-200/90 text-slate-800",
    teal: "from-teal-500/10 to-transparent border-teal-200/80 text-teal-900",
    amber: "from-amber-500/10 to-transparent border-amber-200/80 text-amber-900",
    indigo: "from-indigo-500/10 to-transparent border-indigo-200/80 text-indigo-900",
  }[accent];

  const iconBgClasses = {
    slate: "bg-slate-100 text-slate-700",
    teal: "bg-teal-50 text-teal-600 border border-teal-200/60",
    amber: "bg-amber-50 text-amber-600 border border-amber-200/60",
    indigo: "bg-indigo-50 text-indigo-600 border border-indigo-200/60",
  }[accent];

  return (
    <div className={`relative flex flex-1 min-w-[220px] items-center gap-4 rounded-2xl border bg-white/90 backdrop-blur-sm p-4.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md overflow-hidden ${accentClasses}`}>
      <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${accentClasses}`} />
      {icon && (
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-2xs ${iconBgClasses}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <div className="tabular text-[26px] font-extrabold tracking-tight text-slate-900 leading-none">
          {value}
        </div>
        <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          {label}
        </div>
        {sublabel && (
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">{sublabel}</div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const verdict = project.last_verdict ? VERDICT[project.last_verdict] : null;
  const flags: string[] = [];
  if (project.leaked_count) flags.push(`${project.leaked_count} leaked column removed`);
  if (project.derived_target) flags.push("target derived from its own columns");

  const taskBadgeColor =
    project.task_type === "classification"
      ? "bg-indigo-50 text-indigo-700 border-indigo-200/60"
      : project.task_type === "regression"
      ? "bg-purple-50 text-purple-700 border-purple-200/60"
      : "bg-slate-100 text-slate-600 border-slate-200/60";

  return (
    <Link
      to={`/projects/${project.id}`}
      className="rise group relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-sm p-6 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-teal-500/50 hover:shadow-lg hover:shadow-slate-200/50 overflow-hidden"
    >
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-teal-500/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5">
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100/80 text-slate-700 group-hover:bg-teal-50 group-hover:text-teal-700 group-hover:border group-hover:border-teal-200/60 transition-all shadow-2xs">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-[17px] font-bold text-slate-900 group-hover:text-teal-700 transition-colors leading-tight truncate">
                {project.name}
              </h3>
              {project.target_column ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
                  <span className="font-semibold text-slate-800">Target: {project.target_column}</span>
                  <span>·</span>
                  <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${taskBadgeColor}`}>
                    {project.task_type}
                  </span>
                </div>
              ) : (
                <p className="mt-1.5 text-[12px] text-slate-400">
                  {project.dataset_count ? "Table ready · Awaiting analysis" : "No dataset uploaded yet"}
                </p>
              )}
            </div>
          </div>

          {verdict && (
            <span
              className={`inline-flex items-center gap-1.5 shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider shadow-2xs ${verdict.cls}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
              {verdict.label}
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
            <div className="tabular text-[14px] font-bold text-slate-900">
              {project.row_count != null ? project.row_count.toLocaleString() : "—"}
            </div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-0.5">Rows</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
            <div className="tabular text-[14px] font-bold text-slate-900">
              {project.last_value != null ? project.last_value.toFixed(3) : "—"}
            </div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-0.5">
              {project.last_metric ?? "Score"}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
            <div className="tabular text-[14px] font-bold text-slate-900">{project.run_count}</div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-0.5">Runs</div>
          </div>
        </div>

        {flags.length > 0 && (
          <ul className="mt-3 space-y-1">
            {flags.map((f) => (
              <li key={f} className="flex items-center gap-1.5 rounded-lg border border-amber-200/80 bg-amber-50/80 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-between text-[12px] font-semibold text-slate-400 group-hover:text-teal-700 transition-colors">
          <span>{project.last_run_at ? `Last run ${new Date(project.last_run_at).toLocaleDateString()}` : "Ready to analyze"}</span>
          <span className="flex items-center gap-1 group-hover:translate-x-1 transition-transform">
            Open Workspace <span>→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

export function Projects() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [llm, setLlm] = useState<LLMCheck | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "guarded">("all");

  useEffect(() => {
    api
      .listProjects()
      .then(setProjects)
      .catch((e) => {
        setLoadFailed(true);
        setProjects([]);
        setError(e.message);
      });
    api.llmCheck().then(setLlm).catch(() => setLlm(null));
  }, []);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await api.createProject(name.trim());
      setProjects((p) => [
        {
          ...created,
          dataset_count: 0, run_count: 0, row_count: null,
          last_run_id: null, last_verdict: null, last_metric: null,
          last_value: null, last_run_at: null,
          leaked_count: 0, derived_target: false,
        },
        ...(p ?? []),
      ]);
      setName("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const totalRuns = (projects ?? []).reduce((n, p) => n + p.run_count, 0);
  const totalRows = (projects ?? []).reduce((n, p) => n + (p.row_count ?? 0), 0);
  const caught = (projects ?? []).filter((p) => p.leaked_count || p.derived_target).length;

  const filteredProjects = (projects ?? []).filter((p) => {
    const matchesSearch =
      searchQuery === "" ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.target_column && p.target_column.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.task_type && p.task_type.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (filter === "active") return p.run_count > 0;
    if (filter === "guarded") return (p.leaked_count ?? 0) > 0 || p.derived_target;
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      {/* Hero Section */}
      <header className="rise max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-50/70 backdrop-blur-sm px-3.5 py-1 text-[12px] font-bold text-teal-800 shadow-2xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-600"></span>
          </span>
          Autonomous Machine Learning & Data Intelligence OS
        </div>

        <h1 className="mt-3.5 text-[32px] sm:text-[42px] font-extrabold leading-[1.12] tracking-tight text-slate-900">
          Transform raw tabular data into{" "}
          <span className="bg-gradient-to-r from-teal-600 via-emerald-600 to-indigo-600 bg-clip-text text-transparent">
            live predictive APIs.
          </span>
        </h1>

        <p className="mt-3.5 text-[15px] sm:text-[16px] leading-relaxed text-slate-600">
          Upload any CSV or TSV table. The autonomous pipeline cleans data quality anomalies, benchmarks candidate models, eliminates subtle target leakage, and deploys high-speed REST inference endpoints with counterfactual simulations.
        </p>

        {/* Feature highlight tags */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-2xs">
            <span>🛡️</span> Leakage Shield™
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-2xs">
            <span>⚡</span> Sub-millisecond REST API
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-2xs">
            <span>🔮</span> What-If Scenario Sim
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-2xs">
            <span>📊</span> Visual EDA Distribution
          </span>
        </div>

        {llm && (
          <div className="mt-5 inline-flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white/90 px-3.5 py-1.5 text-[12px] text-slate-600 shadow-2xs">
            <span
              className={`h-2 w-2 rounded-full ${
                llm.ok ? "bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.6)]" : "bg-rose-500"
              }`}
            />
            <span className="font-bold text-slate-800">Intelligence Engine:</span>
            <span>{llm.provider} ({llm.model})</span>
            {!llm.ok && <span className="text-rose-600 font-bold">· unreachable ({llm.error_type})</span>}
          </div>
        )}
      </header>

      {/* KPI Stats Bar */}
      {projects && projects.length > 0 && (
        <div className="rise rise-1 mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            value={projects.length}
            label="Active Projects"
            sublabel="Isolated workspaces"
            accent="slate"
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            }
          />
          <StatCard
            value={totalRuns}
            label="Analyses Executed"
            sublabel="Full autonomous runs"
            accent="teal"
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          />
          <StatCard
            value={totalRows.toLocaleString()}
            label="Rows Processed"
            sublabel="Cleaned & validated"
            accent="indigo"
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            }
          />
          <StatCard
            value={caught}
            label="Leakages Prevented"
            sublabel="Restated targets blocked"
            accent="amber"
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            }
          />
        </div>
      )}

      {/* Create Project Bar */}
      <div className="rise rise-2 mt-8 rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-sm p-3.5 shadow-xs flex flex-wrap items-center gap-3">
        <div className="flex flex-1 items-center gap-3 px-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="Create a new project workspace — e.g. Customer Churn, Loan Default, or Sales Forecast"
            className="w-full bg-transparent text-[14px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
        <Button onClick={create} disabled={creating || !name.trim()} variant="primary">
          {creating ? (
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Creating…
            </span>
          ) : (
            "+ Create Workspace"
          )}
        </Button>
      </div>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

      {/* Projects Filter and Grid */}
      <div className="mt-10">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[14px] font-bold uppercase tracking-wider text-slate-600">
              Project Workspaces
            </h2>
            {projects && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 tabular">
                {filteredProjects.length} of {projects.length}
              </span>
            )}
          </div>

          {/* Search & Filter Controls */}
          {projects && projects.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter workspaces…"
                  className="h-8 rounded-xl border border-slate-200 bg-white/90 pl-8 pr-3 text-[12px] font-medium text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none shadow-2xs"
                />
                <svg
                  className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              <div className="flex items-center rounded-xl border border-slate-200 bg-white/90 p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    filter === "all" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("active")}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    filter === "active" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Active Runs
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("guarded")}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    filter === "guarded" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Leakage Guarded
                </button>
              </div>
            </div>
          )}
        </div>

        {projects === null ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : loadFailed ? (
          <ErrorNote>
            Could not reach the API, so your projects could not be listed. They
            have not been deleted. If a large analysis is still running it may be
            holding the server.
          </ErrorNote>
        ) : projects.length === 0 ? (
          <Empty
            title="No project workspaces yet. Create your first project above, upload a CSV/TSV table, and the autonomous analyst will uncover patterns and predict targets."
          />
        ) : filteredProjects.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white/60 p-8 text-center">
            <p className="text-[13px] font-semibold text-slate-600">No project workspaces match your filter criteria.</p>
            <button
              onClick={() => { setSearchQuery(""); setFilter("all"); }}
              className="mt-2 text-[12px] font-bold text-teal-700 hover:underline cursor-pointer"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {filteredProjects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

