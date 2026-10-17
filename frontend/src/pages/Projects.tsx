import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type LLMCheck, type ProjectSummary } from "../api";
import { SkeletonCard } from "../components/Skeleton";
import { Button, ErrorNote, Empty } from "../components/shell";

const VERDICT = {
  strong: { label: "Strong", cls: "bg-teal-50 text-teal-700 border-teal-200" },
  acceptable: { label: "Acceptable", cls: "bg-teal-50 text-teal-700 border-teal-200" },
  weak: { label: "Weak", cls: "bg-amber-50 text-amber-700 border-amber-200" },
} as const;

function StatCard({
  value,
  label,
  icon,
  accent = "slate",
}: {
  value: string | number;
  label: string;
  icon?: React.ReactNode;
  accent?: "slate" | "teal" | "amber" | "indigo";
}) {
  const accentClasses = {
    slate: "bg-white border-slate-200/90 text-slate-700",
    teal: "bg-white border-teal-200/80 text-teal-800",
    amber: "bg-white border-amber-200/80 text-amber-800",
    indigo: "bg-white border-indigo-200/80 text-indigo-800",
  }[accent];

  return (
    <div className={`flex flex-1 min-w-[200px] items-center gap-3.5 rounded-xl border p-4 shadow-xs transition-all hover:shadow-sm ${accentClasses}`}>
      {icon && (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 shadow-2xs">
          {icon}
        </div>
      )}
      <div>
        <div className="tabular text-[24px] font-bold tracking-tight text-slate-900 leading-none">{value}</div>
        <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  const verdict = project.last_verdict ? VERDICT[project.last_verdict] : null;
  const flags: string[] = [];
  if (project.leaked_count) flags.push(`${project.leaked_count} leaked column removed`);
  if (project.derived_target) flags.push("target derived from its own columns");

  return (
    <Link
      to={`/projects/${project.id}`}
      className="rise group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-teal-500/60 hover:shadow-md"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 group-hover:bg-teal-50 group-hover:text-teal-700 transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-slate-900 group-hover:text-teal-700 transition-colors leading-tight">
                {project.name}
              </h3>
              {project.target_column ? (
                <p className="tabular mt-1 text-[12px] text-slate-500">
                  Target: <span className="font-semibold text-slate-800">{project.target_column}</span> · <span className="capitalize">{project.task_type}</span>
                </p>
              ) : (
                <p className="mt-1 text-[12px] text-slate-400">
                  {project.dataset_count ? "Table ready · not analysed yet" : "No dataset uploaded"}
                </p>
              )}
            </div>
          </div>
          {verdict && (
            <span
              className={`inline-flex items-center gap-1.5 shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${verdict.cls}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {verdict.label}
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-3">
        <div className="grid grid-cols-3 gap-2 text-center text-slate-600">
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="tabular text-[13px] font-bold text-slate-900">
              {project.row_count != null ? project.row_count.toLocaleString() : "—"}
            </div>
            <div className="text-[10px] uppercase font-semibold text-slate-400">Rows</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="tabular text-[13px] font-bold text-slate-900">
              {project.last_value != null ? project.last_value.toFixed(3) : "—"}
            </div>
            <div className="text-[10px] uppercase font-semibold text-slate-400">
              {project.last_metric ?? "Score"}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <div className="tabular text-[13px] font-bold text-slate-900">{project.run_count}</div>
            <div className="text-[10px] uppercase font-semibold text-slate-400">Runs</div>
          </div>
        </div>

        {flags.length > 0 && (
          <ul className="mt-3 space-y-1">
            {flags.map((f) => (
              <li key={f} className="flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}
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

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      {/* Hero Section */}
      <header className="rise max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/20 bg-teal-50/60 px-3 py-1 text-[12px] font-semibold text-teal-800">
          <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
          Autonomous Machine Learning & Data Intelligence OS
        </div>
        <h1 className="mt-3 text-[32px] sm:text-[38px] font-extrabold leading-[1.15] tracking-tight text-slate-900">
          Transform raw tables into actionable intelligence.
        </h1>
        <p className="mt-3 text-[15px] sm:text-[16px] leading-relaxed text-slate-600">
          Upload any tabular dataset. The autonomous pipeline cleans anomalies, formulates prediction tasks, trains and benchmarks candidate models, detects data leakage, and deploys high-performance REST APIs with counterfactual scenario simulators.
        </p>
        {llm && (
          <div className="mt-4 flex items-center gap-2 text-[12px] text-slate-500">
            <span
              className={`h-2 w-2 rounded-full ${
                llm.ok ? "bg-teal-500" : "bg-rose-500"
              }`}
            />
            <span className="font-semibold text-slate-700">LLM Engine:</span>
            <span>{llm.provider} ({llm.model})</span>
            {!llm.ok && <span className="text-rose-600 font-medium">· unreachable ({llm.error_type})</span>}
          </div>
        )}
      </header>

      {/* KPI Stats Bar */}
      {projects && projects.length > 0 && (
        <div className="rise rise-1 mt-8 flex flex-wrap gap-4">
          <StatCard
            value={projects.length}
            label="Active Projects"
            icon={
              <svg className="h-5 w-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            }
          />
          <StatCard
            value={totalRuns}
            label="Analyses Executed"
            accent="teal"
            icon={
              <svg className="h-5 w-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          />
          <StatCard
            value={totalRows.toLocaleString()}
            label="Rows Processed"
            accent="indigo"
            icon={
              <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            }
          />
          <StatCard
            value={caught}
            label="Leakages Prevented"
            accent="amber"
            icon={
              <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            }
          />
        </div>
      )}

      {/* Create Project Bar */}
      <div className="rise rise-2 mt-8 rounded-xl border border-slate-200 bg-white p-3 shadow-xs flex flex-wrap items-center gap-3">
        <div className="flex flex-1 items-center gap-2.5 px-2">
          <svg className="h-5 w-5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v16m8-8H4" />
          </svg>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="Create a new project workspace — e.g. Customer Churn or Loan Default"
            className="w-full bg-transparent text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
        <Button onClick={create} disabled={creating || !name.trim()}>
          {creating ? "Creating…" : "Create Project"}
        </Button>
      </div>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

      {/* Projects Grid */}
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[14px] font-bold uppercase tracking-wider text-slate-500">
            Your Project Workspaces
          </h2>
          {projects && projects.length > 0 && (
            <span className="text-[12px] text-slate-400 tabular">
              {projects.length} {projects.length === 1 ? "project" : "projects"}
            </span>
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
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
