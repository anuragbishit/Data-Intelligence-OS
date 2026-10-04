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

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Data Intelligence OS
          </p>
          <h2 className="text-2xl font-bold text-slate-900">
            Data Health Score
          </h2>
        </div>

        <div className="text-right">
          <div className="text-4xl font-bold text-slate-900">
            {health.score}
            <span className="text-lg text-slate-400">/100</span>
          </div>
          <div className="text-sm font-medium capitalize text-slate-500">
            {statusLabel}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric
          label="Completeness"
          value={health.metrics.completeness}
        />
        <Metric
          label="Validity"
          value={health.metrics.validity}
        />
        <Metric
          label="Uniqueness"
          value={health.metrics.uniqueness}
        />
        <Metric
          label="Consistency"
          value={health.metrics.consistency}
        />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4 border-t border-slate-100 pt-5">
        <Info label="Rows" value={health.dataset.rows.toLocaleString()} />
        <Info label="Columns" value={health.dataset.columns} />
        <Info
          label="Duplicates"
          value={health.dataset.duplicate_rows.toLocaleString()}
        />
      </div>

      {health.findings.length > 0 && (
        <div className="mt-6 border-t border-slate-100 pt-5">
          <h3 className="mb-3 font-semibold text-slate-900">
            Findings
          </h3>

          <div className="space-y-2">
            {health.findings.map((finding, index) => (
              <div
                key={`${finding.type}-${index}`}
                className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700"
              >
                {finding.message}
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
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>

      <div className="text-xl font-bold text-slate-900">
        {value.toFixed(1)}
        <span className="ml-1 text-sm font-medium text-slate-400">
          %
        </span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-slate-900"
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
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-slate-800">
        {value}
      </div>
    </div>
  );
}
