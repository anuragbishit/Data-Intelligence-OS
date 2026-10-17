import { Navigate, Route, Routes, Link, useLocation } from "react-router-dom";
import { ProjectDetail } from "./pages/ProjectDetail";
import { Projects } from "./pages/Projects";
import { RunDetail } from "./pages/RunDetail";

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink font-sans selection:bg-teal-500/20 selection:text-teal-900">
      {/* Top accent gradient bar */}
      <div className="h-[3px] w-full bg-gradient-to-r from-teal-500 via-indigo-500 to-emerald-400" />

      {/* Main modern header */}
      <header className="border-b border-rule/80 bg-surface/90 backdrop-blur-md sticky top-0 z-40 transition-shadow">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <Link to="/" className="group flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 shadow-sm transition-transform duration-200 group-hover:scale-105">
                <svg className="h-5 w-5 text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-[16px] font-bold tracking-tight text-slate-900 group-hover:text-teal-700 transition-colors">
                  Data Intelligence OS
                </span>
                <span className="text-[10px] font-medium tracking-wide uppercase text-slate-400">
                  Autonomous Analytics Engine
                </span>
              </div>
            </Link>

            <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-50/70 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulse" />
              Engine Online
            </span>
          </div>

          {/* Nav Links */}
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/"
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                location.pathname === "/"
                  ? "bg-slate-100 text-slate-900 font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              Projects
            </Link>
            <a
              href="/docs"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            >
              <span>API Docs</span>
              <span className="text-[11px] opacity-70">↗</span>
            </a>
            <a
              href="https://github.com/anuragbishit/Data-Intelligence-OS"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-50 transition-all"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>GitHub</span>
            </a>
          </nav>
        </div>
      </header>

      {/* Main Page Content */}
      <main className="flex-1 overflow-x-hidden">
        {children}
      </main>

      {/* Global Footer */}
      <footer className="mt-auto border-t border-rule/80 bg-white/60 py-6 text-[12px] text-slate-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Data Intelligence OS</span>
            <span>·</span>
            <span>Production Autonomous ML Runtime</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 tabular">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">FastAPI</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">PostgreSQL 16</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Redis 7</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Scikit-Learn</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Projects />} />
        <Route path="/projects/:projectId" element={<ProjectDetail />} />
        <Route path="/runs/:runId" element={<RunDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
