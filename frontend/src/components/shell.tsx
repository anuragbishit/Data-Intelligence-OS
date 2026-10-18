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
      className={`rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-sm shadow-[0_2px_12px_-2px_rgba(15,23,42,0.04),0_8px_24px_-4px_rgba(15,23,42,0.03)] hover:border-slate-300 transition-all duration-200 ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
            <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate-700">
              {title}
            </h2>
          </div>
          {aside}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 transition-colors hover:bg-slate-100/60 shadow-2xs">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="tabular mt-1 text-[17px] font-extrabold text-slate-900">{value}</div>
    </div>
  );
}

export function Empty({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center shadow-xs">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 shadow-2xs">
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      </div>
      <p className="max-w-md text-[14px] leading-relaxed text-slate-600 font-medium">{title}</p>
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
    "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold " +
    "transition-all duration-150 active:scale-[0.98] shadow-xs cursor-pointer " +
    "disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none";
  const styles =
    variant === "primary"
      ? "bg-slate-900 text-white hover:bg-slate-800 hover:shadow-md shadow-slate-950/20"
      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900";
  return (
    <button className={`${base} ${styles}`} {...rest}>
      {children}
    </button>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-[13px] text-rose-800 shadow-2xs">
      <span className="mt-0.5 shrink-0 text-rose-600">⚠️</span>
      <div className="flex-1 font-medium">{children}</div>
    </div>
  );
}
