import { Navigate, Route, Routes, Link } from "react-router-dom";
import { ProjectDetail } from "./pages/ProjectDetail";
import { Projects } from "./pages/Projects";
import { RunDetail } from "./pages/RunDetail";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <header className="border-b border-rule bg-surface sticky top-0 z-10 shadow-sm">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link to="/" className="text-[17px] font-bold text-ink hover:text-verified transition-colors">
            Data Intelligence OS
          </Link>
        </div>
      </header>
      <main className="flex-1 overflow-x-hidden">
        {children}
      </main>
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
