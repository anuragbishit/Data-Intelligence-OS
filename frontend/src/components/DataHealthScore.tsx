type DataHealth = {
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
  findings: {
    type: string;
    severity: string;
    message: string;
  }[];
};

type Props = {
  health: DataHealth;
};

export default function DataHealthScore({ health }: Props) {
  const statusLabel = health.status.replace("_", " ");
  const isHealthy = health.score >= 80;
  const isModerate = health.score >= 60 && health.score < 80;

  const scoreBadgeCls = isHealthy
    ? "border-teal-200 bg-teal-50 text-teal-800"
    : isModerate
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-rose-200 bg-rose-50 text-rose-800";

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-sm p-6 shadow-xs hover:shadow-md transition-shadow">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-teal-500" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Data Intelligence OS · Automated Quality Shield
            </p>
          </div>
          <h2 className="mt-1 text-[22px] sm:text-[24px] font-extrabold text-slate-900 tracking-tight">
            Data Health & Integrity Score
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <div className={`rounded-2xl border px-4 py-2 text-right shadow-2xs ${scoreBadgeCls}`}>
            <div className="tabular text-[30px] font-black tracking-tight leading-none">
              {health.score}
              <span className="text-[16px] font-bold opacity-60">/100</span>
            </div>
            <div className="text-[11px] font-extrabold uppercase tracking-wider mt-0.5">
              {statusLabel}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <Metric
          label="Completeness"
          value={health.metrics.completeness}
          accent="teal"
        />
        <Metric
          label="Validity"
          value={health.metrics.validity}
          accent="indigo"
        />
        <Metric
          label="Uniqueness"
          value={health.metrics.uniqueness}
          accent="teal"
        />
        <Metric
          label="Consistency"
          value={health.metrics.consistency}
          accent="amber"
        />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 border-t border-slate-100 pt-5">
        <Info label="Total Rows" value={health.dataset.rows.toLocaleString()} />
        <Info label="Columns" value={health.dataset.columns} />
        <Info
          label="Duplicate Rows"
          value={health.dataset.duplicate_rows.toLocaleString()}
        />
      </div>

      {health.findings.length > 0 && (
        <div className="mt-6 border-t border-slate-100 pt-5">
          <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-slate-500">
            Detected Integrity Observations ({health.findings.length})
          </h3>

          <div className="space-y-2">
            {health.findings.map((finding, index) => (
              <div
                key={`${finding.type}-${index}`}
                className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-[13px] text-slate-700 shadow-2xs"
              >
                <span className="shrink-0 text-slate-400">ℹ️</span>
                <div className="min-w-0">
                  <span className="font-semibold text-slate-900 capitalize mr-1">
                    {finding.type.replace(/_/g, " ")}:
                  </span>
                  <span>{finding.message}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  accent = "teal",
}: {
  label: string;
  value: number;
  accent?: "teal" | "indigo" | "amber";
}) {
  const barColor =
    accent === "teal"
      ? "bg-gradient-to-r from-teal-500 to-emerald-500"
      : accent === "indigo"
      ? "bg-gradient-to-r from-indigo-500 to-blue-500"
      : "bg-gradient-to-r from-amber-500 to-orange-500";

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 shadow-2xs">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="tabular text-[20px] font-extrabold text-slate-900">
        {value.toFixed(1)}
        <span className="ml-0.5 text-[13px] font-semibold text-slate-400">
          %
        </span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200/80">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 text-center sm:text-left">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="tabular mt-0.5 text-[16px] font-extrabold text-slate-800">
        {value}
      </div>
    </div>
  );
}

