import { useEffect, useState } from "react";
import { api, type LivePredictionResponse, type PredictionSchemaResponse } from "../api";
import { Button, ErrorNote, Panel } from "./shell";

interface Props {
  runId: string;
  targetColumn?: string;
  taskType?: string;
  onClose?: () => void;
}

export function DeployApiPanel({ runId, targetColumn = "Target", taskType = "classification", onClose }: Props) {
  const [schema, setSchema] = useState<PredictionSchemaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"curl" | "python" | "javascript" | "console">("curl");
  const [copied, setCopied] = useState<string | null>(null);

  // Live Console state
  const [consoleInput, setConsoleInput] = useState<string>("");
  const [consoleResponse, setConsoleResponse] = useState<LivePredictionResponse | null>(null);
  const [consoleError, setConsoleError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);

  const baseUrl = window.location.origin;
  const endpointPath = `/api/v1/analysis/${runId}/predict`;
  const fullEndpointUrl = `${baseUrl}${endpointPath}`;

  useEffect(() => {
    let active = true;
    setLoading(true);

    api
      .getPredictionSchema(runId)
      .then((data) => {
        if (!active) return;
        setSchema(data);

        // Build sample payload from defaults
        const samplePayload: Record<string, unknown> = {};
        for (const item of data.features) {
          samplePayload[item.name] = item.default_value;
        }
        setConsoleInput(JSON.stringify({ features: samplePayload }, null, 2));
      })
      .catch(() => {
        if (!active) return;
        setConsoleInput(JSON.stringify({ features: {} }, null, 2));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [runId]);

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleSendTestRequest() {
    setTesting(true);
    setConsoleError(null);
    setConsoleResponse(null);
    const start = performance.now();

    try {
      let parsed: { features: Record<string, unknown> };
      try {
        parsed = JSON.parse(consoleInput);
      } catch {
        throw new Error("Invalid JSON in request payload. Please verify JSON formatting.");
      }

      if (!parsed.features || typeof parsed.features !== "object") {
        throw new Error("Request body must include a 'features' object.");
      }

      const res = await api.predictSingle(runId, parsed.features);
      setLatency(Math.round(performance.now() - start));
      setConsoleResponse(res);
    } catch (err) {
      setConsoleError(err instanceof Error ? err.message : "Request failed.");
      setLatency(Math.round(performance.now() - start));
    } finally {
      setTesting(false);
    }
  }

  // Generate code snippets
  const sampleJson = consoleInput || JSON.stringify({ features: { sample_feature: 10 } }, null, 2);

  const curlSnippet = `curl -X POST "${fullEndpointUrl}" \\
  -H "Content-Type: application/json" \\
  -d '${sampleJson.replace(/\n/g, "\n  ")}'`;

  const pythonSnippet = `import requests

url = "${fullEndpointUrl}"
payload = ${sampleJson}

response = requests.post(url, json=payload)
data = response.json()

print(f"Prediction: {data['prediction']}")
if "confidence" in data and data["confidence"] is not None:
    print(f"Confidence: {data['confidence'] * 100:.1f}%")
print(f"Probabilities: {data.get('probabilities')}")`;

  const jsSnippet = `const response = await fetch("${fullEndpointUrl}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${sampleJson}),
});

const data = await response.json();
console.log("Prediction:", data.prediction);
console.log("Confidence:", data.confidence);`;

  return (
    <Panel
      title="Deploy as Live REST API"
      aside={
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded bg-verified-wash px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-verified">
            <span className="h-1.5 w-1.5 rounded-full bg-verified animate-ping" />
            Live Endpoint
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="text-[12px] text-ink-faint hover:text-ink ml-2"
            >
              ✕
            </button>
          )}
        </div>
      }
    >
      <p className="text-[12px] leading-relaxed text-ink-soft mb-4">
        This trained {taskType} model for <strong className="text-ink">{targetColumn}</strong> is instantly deployed as a high-performance REST microservice
        {schema ? ` accepting ${schema.features.length} features` : ""}. Send HTTP POST requests with JSON feature payloads to get instant predictions in production.
        {loading && <span className="ml-2 text-ink-faint">(Loading schema…)</span>}
      </p>

      {/* URL BAR */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border border-rule bg-paper/60 p-2.5">
        <span className="rounded bg-verified px-2 py-1 font-mono text-[11px] font-bold text-surface">
          POST
        </span>
        <code className="flex-1 font-mono text-[12px] text-ink truncate select-all">
          {fullEndpointUrl}
        </code>
        <button
          onClick={() => copyToClipboard(fullEndpointUrl, "url")}
          className="rounded border border-rule px-2.5 py-1 text-[11px] font-medium text-ink-soft hover:bg-surface transition-colors"
        >
          {copied === "url" ? "✓ Copied" : "Copy URL"}
        </button>
        <a
          href="/docs#/analysis/predict_single_record_api_v1_analysis__run_id__predict_post"
          target="_blank"
          rel="noreferrer"
          className="rounded border border-rule px-2.5 py-1 text-[11px] font-medium text-ink-soft hover:bg-surface transition-colors"
        >
          Swagger Docs ↗
        </a>
      </div>

      {/* TABS */}
      <div className="mb-3 flex border-b border-rule">
        <button
          onClick={() => setActiveTab("curl")}
          className={`px-3 py-1.5 text-[12px] font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "curl"
              ? "border-ink text-ink font-semibold"
              : "border-transparent text-ink-faint hover:text-ink"
          }`}
        >
          cURL
        </button>
        <button
          onClick={() => setActiveTab("python")}
          className={`px-3 py-1.5 text-[12px] font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "python"
              ? "border-ink text-ink font-semibold"
              : "border-transparent text-ink-faint hover:text-ink"
          }`}
        >
          Python (requests)
        </button>
        <button
          onClick={() => setActiveTab("javascript")}
          className={`px-3 py-1.5 text-[12px] font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "javascript"
              ? "border-ink text-ink font-semibold"
              : "border-transparent text-ink-faint hover:text-ink"
          }`}
        >
          JavaScript / Node.js
        </button>
        <button
          onClick={() => setActiveTab("console")}
          className={`px-3 py-1.5 text-[12px] font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
            activeTab === "console"
              ? "border-ink text-ink font-semibold"
              : "border-transparent text-ink-faint hover:text-ink"
          }`}
        >
          <span>⚡</span> Live Test Console
        </button>
      </div>

      {/* TAB CONTENT: cURL */}
      {activeTab === "curl" && (
        <div className="relative">
          <pre className="rounded-lg bg-slate-900 p-4 font-mono text-[12px] leading-relaxed text-slate-100 overflow-x-auto">
            <code>{curlSnippet}</code>
          </pre>
          <button
            onClick={() => copyToClipboard(curlSnippet, "curl")}
            className="absolute top-3 right-3 rounded bg-slate-800 border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white transition-colors"
          >
            {copied === "curl" ? "✓ Copied" : "Copy Code"}
          </button>
        </div>
      )}

      {/* TAB CONTENT: Python */}
      {activeTab === "python" && (
        <div className="relative">
          <pre className="rounded-lg bg-slate-900 p-4 font-mono text-[12px] leading-relaxed text-slate-100 overflow-x-auto">
            <code>{pythonSnippet}</code>
          </pre>
          <button
            onClick={() => copyToClipboard(pythonSnippet, "python")}
            className="absolute top-3 right-3 rounded bg-slate-800 border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white transition-colors"
          >
            {copied === "python" ? "✓ Copied" : "Copy Code"}
          </button>
        </div>
      )}

      {/* TAB CONTENT: JavaScript */}
      {activeTab === "javascript" && (
        <div className="relative">
          <pre className="rounded-lg bg-slate-900 p-4 font-mono text-[12px] leading-relaxed text-slate-100 overflow-x-auto">
            <code>{jsSnippet}</code>
          </pre>
          <button
            onClick={() => copyToClipboard(jsSnippet, "js")}
            className="absolute top-3 right-3 rounded bg-slate-800 border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white transition-colors"
          >
            {copied === "js" ? "✓ Copied" : "Copy Code"}
          </button>
        </div>
      )}

      {/* TAB CONTENT: Live Test Console */}
      {activeTab === "console" && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] font-semibold text-ink">Request Body (JSON)</label>
                <span className="text-[11px] text-ink-faint">Editable</span>
              </div>
              <textarea
                value={consoleInput}
                onChange={(e) => setConsoleInput(e.target.value)}
                rows={10}
                className="w-full rounded-lg border border-rule-strong bg-slate-900 p-3 font-mono text-[12px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-verified"
                placeholder='{\n  "features": {\n    "column_name": 10\n  }\n}'
              />
              <div className="mt-2 flex items-center justify-between">
                <Button onClick={handleSendTestRequest} disabled={testing}>
                  {testing ? "Sending…" : "⚡ Send Live Request"}
                </Button>
                {latency != null && (
                  <span className="font-mono text-[11px] text-ink-faint">
                    Response time: <strong>{latency} ms</strong>
                  </span>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[12px] font-semibold text-ink">Live API Response</label>
                {consoleResponse && (
                  <span className="rounded bg-verified-wash px-2 py-0.5 font-mono text-[11px] font-semibold text-verified">
                    200 OK
                  </span>
                )}
                {consoleError && (
                  <span className="rounded bg-failed-wash px-2 py-0.5 font-mono text-[11px] font-semibold text-failed">
                    Error
                  </span>
                )}
              </div>

              {consoleError && (
                <div className="mb-2">
                  <ErrorNote>{consoleError}</ErrorNote>
                </div>
              )}

              <pre className="h-[238px] rounded-lg bg-slate-900 p-3 font-mono text-[12px] leading-relaxed text-slate-100 overflow-y-auto">
                <code>
                  {consoleResponse
                    ? JSON.stringify(consoleResponse, null, 2)
                    : consoleError
                    ? `{\n  "error": "${consoleError}"\n}`
                    : '// Click "Send Live Request" to test endpoint live...'}
                </code>
              </pre>

              {consoleResponse && (
                <div className="mt-2.5 flex items-center justify-between rounded border border-verified/40 bg-verified-wash/30 px-3 py-1.5 text-[12px]">
                  <span className="text-ink-soft">
                    Result: <strong className="text-ink">{consoleResponse.prediction_display}</strong>
                  </span>
                  {consoleResponse.confidence != null && (
                    <span className="font-mono font-semibold text-verified">
                      {(consoleResponse.confidence * 100).toFixed(1)}% confidence
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RESPONSE SCHEMA REFERENCE */}
      <div className="mt-5 border-t border-rule pt-4">
        <h4 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint mb-2">
          API Response Schema Reference
        </h4>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-[12px]">
          <div className="rounded border border-rule bg-paper/40 p-2">
            <code className="font-semibold text-ink">prediction</code>
            <p className="text-[11px] text-ink-faint mt-0.5">
              Predicted class name (or numerical value for regression).
            </p>
          </div>
          <div className="rounded border border-rule bg-paper/40 p-2">
            <code className="font-semibold text-ink">confidence</code>
            <p className="text-[11px] text-ink-faint mt-0.5">
              Score (0.0 to 1.0) indicating probability of top predicted class.
            </p>
          </div>
          <div className="rounded border border-rule bg-paper/40 p-2">
            <code className="font-semibold text-ink">probabilities</code>
            <p className="text-[11px] text-ink-faint mt-0.5">
              Full breakdown of probability percentages for every possible class.
            </p>
          </div>
          <div className="rounded border border-rule bg-paper/40 p-2">
            <code className="font-semibold text-ink">feature_contributions</code>
            <p className="text-[11px] text-ink-faint mt-0.5">
              Local impact score & direction for each input feature.
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
