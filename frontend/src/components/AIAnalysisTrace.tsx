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

function eventBadge(event: string) {
  if (/failed|unavailable|skipped/.test(event)) {
    return "bg-rose-50 text-rose-700 border border-rose-200/80";
  }
  if (/fallback|corrected|retry|limit|no_improvement|abandon/.test(event)) {
    return "bg-amber-50 text-amber-700 border border-amber-200/80";
  }
  return "bg-teal-50 text-teal-700 border border-teal-200/80";
}

export default function AIAnalysisTrace({ steps, children }: Props) {
  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-sm p-6 shadow-xs hover:shadow-md transition-shadow">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-teal-500" />
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Pipeline Transparency · Autonomous Audit Trail
          </p>
        </div>
        <h2 className="mt-1 text-[22px] sm:text-[24px] font-extrabold text-slate-900 tracking-tight">
          AI Analysis Execution Trace
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Transparent, verifiable execution trace showing how the autonomous engine planned, cleaned, trained, and verified this model.
        </p>
      </div>

      <div className="space-y-3.5">
        {steps.length === 0 ? (
          <p className="text-[13px] text-slate-400 font-medium">No pipeline events were recorded for this run.</p>
        ) : (
          steps.map((step, index) => (
            <div
              key={`${step.stage}-${index}`}
              className="flex items-start gap-3.5 rounded-xl border border-slate-100 bg-slate-50/70 p-4 shadow-2xs hover:bg-white hover:border-slate-200 transition-colors"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-[12px] font-black text-teal-400 shadow-sm">
                {String(index + 1).padStart(2, "0")}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[14px] font-bold text-slate-900">{step.stage}</h3>
                  <span className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ${eventBadge(step.event)}`}>
                    {step.event}
                  </span>
                </div>

                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
                  {step.detail}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {children && <div className="mt-6 border-t border-slate-100 pt-5">{children}</div>}
    </section>
  );
}

