import type { ReactNode } from "react";

export function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-slate-200/90 bg-surface shadow-xs transition-all duration-200 ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-rule/80 px-5 py-3">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
            {title}
          </h2>
          {aside}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-rule/60 bg-paper/50 p-2.5 transition-colors hover:bg-paper">
      <div className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">{label}</div>
      <div className="tabular mt-0.5 text-[16px] font-bold text-ink">{value}</div>
    </div>
  );
}

export function Empty({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-rule-strong bg-paper/40 px-6 py-10 text-center">
      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      </div>
      <p className="max-w-md text-[13px] leading-relaxed text-ink-soft">{title}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" }) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold " +
    "transition-all duration-150 active:scale-[0.98] shadow-xs cursor-pointer " +
    "disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none";
  const styles =
    variant === "primary"
      ? "bg-slate-900 text-white hover:bg-slate-800 hover:shadow-sm"
      : "border border-rule-strong bg-surface text-ink-soft hover:bg-paper hover:text-ink";
  return (
    <button className={`${base} ${styles}`} {...rest}>
      {children}
    </button>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-failed/30 bg-failed-wash px-3.5 py-2.5 text-[13px] text-failed">
      <span className="mt-0.5 shrink-0 text-failed">⚠️</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}
