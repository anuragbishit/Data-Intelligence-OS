import type { ReactNode } from "react";

type TraceStep = {
  stage: string;
  event: string;
  detail: string;
};

type Props = {
  steps: TraceStep[];
  children?: ReactNode;
};

function eventColor(event: string) {
  if (/failed|unavailable|skipped/.test(event)) return "text-failed";
  if (/fallback|corrected|retry|limit|no_improvement|abandon/.test(event)) {
    return "text-weak";
  }
  return "text-verified";
}

export default function AIAnalysisTrace({ steps, children }: Props) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <p className="text-sm font-medium text-slate-500">
          Data Intelligence OS
        </p>

        <h2 className="text-2xl font-bold text-slate-900">
          AI Analysis Trace
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Transparent view of how the analysis reached its conclusions.
        </p>
      </div>

      <div className="space-y-4">
        {steps.length === 0 ? (
          <p className="text-sm text-slate-500">No pipeline events were recorded for this run.</p>
        ) : (
          steps.map((step, index) => (
            <div
              key={`${step.stage}-${index}`}
              className="flex gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                {String(index + 1).padStart(2, "0")}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-slate-900">{step.stage}</h3>
                  <span className={`font-mono text-xs font-medium ${eventColor(step.event)}`}>
                    {step.event}
                  </span>
                </div>

                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {step.detail}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {children && <div className="mt-6 border-t border-slate-200 pt-5">{children}</div>}
    </section>
  );
}
