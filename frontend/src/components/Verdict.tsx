import type { Quality } from "../api";

const TONE = {
  strong: { label: "Strong", cls: "bg-teal-50 text-teal-700 border-teal-200" },
  acceptable: { label: "Acceptable", cls: "bg-teal-50 text-teal-700 border-teal-200" },
  weak: { label: "Weak", cls: "bg-amber-50 text-amber-700 border-amber-200" },
} as const;

export function VerdictBadge({ verdict }: { verdict: Quality["verdict"] }) {
  const t = TONE[verdict] ?? TONE.weak;
  const dotColor = verdict === "strong" || verdict === "acceptable" ? "bg-teal-500" : "bg-amber-500";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[11px] font-bold uppercase tracking-wider shadow-2xs ${t.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor} ${verdict === "strong" ? "animate-pulse" : ""}`} />
      {t.label}
    </span>
  );
}

/**
 * Checks are shown passed *and* failed, deliberately.
 *
 * The reflection agent kept inventing causes ("only 482 rows, too small")
 * for checks that had actually passed. Stating what is fine, not only what
 * is broken, is what stopped that -- and a reader deserves the same context.
 */
export function QualityChecks({ quality }: { quality: Quality }) {
  return (
    <ul className="space-y-2.5">
      {quality.checks.map((c) => {
        const toneBg = c.passed
          ? "bg-teal-50 border-teal-200 text-teal-800"
          : c.gating === false
            ? "bg-amber-50 border-amber-200 text-amber-800"
            : "bg-rose-50 border-rose-200 text-rose-800";
        const dotColor = c.passed
          ? "bg-teal-500"
          : c.gating === false
            ? "bg-amber-500"
            : "bg-rose-500";
        const label = c.passed ? "Passed" : c.gating === false ? "Warning" : "Failed";

        return (
          <li key={c.name} className={`flex items-start gap-3 rounded-lg border p-2.5 ${toneBg}`}>
            <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="tabular text-[12px] font-bold uppercase tracking-wider">
                  {c.name.replace(/_/g, " ")}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                  {label}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] leading-relaxed opacity-90">{c.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
