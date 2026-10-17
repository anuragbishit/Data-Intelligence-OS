import { useEffect, useState } from "react";

/**
 * Shown while an analysis runs.
 *
 * The request is synchronous, so the client cannot know which stage is
 * executing. Rather than invent a progress bar, this shows the real pipeline,
 * a live elapsed count, and an honest expectation.
 */
const STAGES = [
  ["Clean", "duplicates, placeholders, whitespace"],
  ["Profile", "types, nulls, outliers, correlations"],
  ["Plan", "choose a target and task"],
  ["Train", "fit and rank candidate models"],
  ["Explain", "measure what drove the predictions"],
  ["Reflect", "judge the result, retry if worthwhile"],
  ["Report", "write it up"],
] as const;

export function RunProgress() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="rise rounded-xl border border-teal-500/30 bg-teal-50/40 p-4">
      <div className="mb-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-600"></span>
          </span>
          <span className="text-[13px] font-bold text-teal-900">Autonomous Pipeline Running…</span>
        </div>
        <span className="tabular rounded-full bg-white border border-teal-200 px-2 py-0.5 text-[11px] font-mono font-bold text-teal-800">
          {seconds}s elapsed
        </span>
      </div>

      <ol className="space-y-2">
        {STAGES.map(([name, detail], i) => (
          <li key={name} className="flex items-center gap-2.5 rounded-lg bg-white/70 px-2.5 py-1.5 border border-teal-100">
            <span
              aria-hidden
              className="sweep h-2 w-2 shrink-0 rounded-full bg-teal-600"
              style={{ animationDelay: `${i * 120}ms` }}
            />
            <span className="text-[12px] font-semibold text-slate-900">{name}</span>
            <span className="text-[11px] text-slate-500 truncate">{detail}</span>
          </li>
        ))}
      </ol>

      <p className="mt-3.5 border-t border-teal-100 pt-2.5 text-[12px] leading-snug text-slate-600">
        Usually completes in 10–30 seconds. Large tables are intelligently sampled.
        {seconds > 45 && (
          <span className="block pt-1 font-medium text-amber-700">
            Taking longer than usual — a large dataset is currently training candidate models in the background.
          </span>
        )}
      </p>
    </div>
  );
}
