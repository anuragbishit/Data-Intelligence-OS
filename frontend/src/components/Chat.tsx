import { useEffect, useRef, useState } from "react";
import { api, type ChatMessage } from "../api";
import { Button, ErrorNote } from "./shell";

const SUGGESTIONS = [
  "What's in this data?",
  "Which columns have missing values?",
  "How did the model do?",
];

type ChatProps = {
  projectId: string;
  hasDataset: boolean;
  datasetId?: string;
  embedded?: boolean;
};

export function Chat({ projectId, hasDataset, datasetId, embedded = false }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.chatHistory(projectId).then(setMessages).catch(() => setMessages([]));
  }, [projectId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, busy]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setBusy(true);
    setError(null);
    setDraft("");
    // Show the question immediately; the server persists its own copy.
    setMessages((m) => [
      ...m,
      { id: `local-${Date.now()}`, role: "user", content: question, created_at: "" },
    ]);
    try {
      const reply = await api.chatAsk(projectId, question, datasetId);
      setMessages((m) => [...m, reply]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={embedded ? "flex h-[400px] flex-col" : "flex h-[480px] flex-col rounded-xl border border-slate-200/90 bg-white shadow-xs"}>
      <header className={`flex items-center justify-between border-b border-slate-100 py-3 ${embedded ? "" : "px-5"}`}>
        <div className="flex items-center gap-2">
          <span className="text-[14px]">💬</span>
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-slate-700">
            Conversational Data Copilot
          </h2>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => api.chatClear(projectId).then(() => setMessages([]))}
            className="rounded px-2 py-0.5 text-[11px] font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Clear History
          </button>
        )}
      </header>

      <div className={`flex-1 space-y-3.5 overflow-y-auto py-4 ${embedded ? "" : "px-5"}`}>
        {messages.length === 0 && (
          <div>
            <p className="text-[13px] leading-relaxed text-slate-600">
              Ask natural-language questions about this table. Computations are verified directly against dataset rows.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={!hasDataset}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] text-slate-700 hover:border-slate-300 hover:bg-slate-100 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
            <div
              className={`inline-block max-w-[90%] rounded-2xl px-4 py-2.5 text-left text-[13px] leading-relaxed shadow-2xs ${
                m.role === "user"
                  ? "rounded-tr-xs bg-slate-900 text-white"
                  : "rounded-tl-xs border border-slate-200 bg-slate-50 text-slate-800"
              }`}
            >
              {m.content}
            </div>
            {!!m.metadata?.tools?.length && (
              <div className="tabular mt-1 text-[11px] text-slate-400">
                computed with {m.metadata.tools.map((t) => t.tool).join(", ")}
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-[12px] text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-ping" />
            <span>Analyzing dataset & querying statistics…</span>
          </div>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <div ref={endRef} />
      </div>

      <div className={`flex gap-2 border-t border-slate-100 py-3 ${embedded ? "" : "px-5"}`}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(draft)}
          disabled={!hasDataset || busy}
          placeholder={hasDataset ? "Ask a question about your columns, distributions, or metrics…" : "Upload a table first"}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600 disabled:bg-slate-50 disabled:text-slate-400"
        />
        <Button onClick={() => send(draft)} disabled={!hasDataset || busy || !draft.trim()}>
          Send
        </Button>
      </div>
    </section>
  );
}
