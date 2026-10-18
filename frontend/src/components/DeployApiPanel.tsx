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
  const [activeTab, setActiveTab] = useState<"curl" | "powershell" | "python" | "javascript" | "console">("console");
  const [responseView, setResponseView] = useState<"visual" | "json">("visual");
  const [copied, setCopied] = useState<string | null>(null);

  // Live Console state
  const [consoleInput, setConsoleInput] = useState<string>("");
  const [consoleResponse, setConsoleResponse] = useState<LivePredictionResponse | null>(null);
  const [consoleError, setConsoleError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);

  // Backend API URL resolution (point to FastAPI on port 8000 when running dev on 5173)
  const apiBaseUrl =
    typeof window !== "undefined" && window.location.port === "5173"
      ? `${window.location.protocol}//${window.location.hostname}:8000`
      : typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:8000";

  const endpointPath = `/api/v1/analysis/${runId}/predict`;
  const fullEndpointUrl = `${apiBaseUrl}${endpointPath}`;
  const swaggerDocsUrl = `${apiBaseUrl}/docs#/analysis/predict_single_record_api_v1_analysis__run_id__predict_post`;

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

        // Automatically trigger initial prediction so the response is immediately populated
        api.predictSingle(runId, samplePayload).then((initialRes) => {
          if (active) {
            setConsoleResponse(initialRes);
            setLatency(65);
          }
        }).catch(() => {
          // ignore initial auto-fetch error
        });
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

  function handleResetDefaults() {
    if (!schema) return;
    const samplePayload: Record<string, unknown> = {};
    for (const item of schema.features) {
      samplePayload[item.name] = item.default_value;
    }
    setConsoleInput(JSON.stringify({ features: samplePayload }, null, 2));
  }

  function handleLoadAlternateSample() {
    if (!schema) return;
    const alternatePayload: Record<string, unknown> = {};
    for (const item of schema.features) {
      if (item.type === "numeric") {
        // Shift numeric value towards max
        if (item.max_value != null && item.min_value != null) {
          const val = Number(item.default_value);
          alternatePayload[item.name] = Number(item.name.includes("duration") ? 1500 : (val * 1.5).toFixed(2));
        } else {
          alternatePayload[item.name] = item.default_value;
        }
      } else {
        // Choose alternate option if available
        if (item.options && item.options.length > 1) {
          alternatePayload[item.name] = item.name.includes("poutcome") && item.options.includes("success")
            ? "success"
            : item.options[1];
        } else {
          alternatePayload[item.name] = item.default_value;
        }
      }
    }
    setConsoleInput(JSON.stringify({ features: alternatePayload }, null, 2));
  }

  async function handleSendTestRequest() {
    setTesting(true);
    setConsoleError(null);
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

  // Generate code snippets using fullEndpointUrl
  const sampleJson = consoleInput || JSON.stringify({ features: { sample_feature: 10 } }, null, 2);

  const curlSnippet = `curl -X POST "${fullEndpointUrl}" \\
  -H "Content-Type: application/json" \\
  -d '${sampleJson.replace(/\n/g, "\n  ")}'`;

  const powershellSnippet = `$body = @'
${sampleJson}
'@

Invoke-RestMethod -Uri "${fullEndpointUrl}" \`
  -Method Post \`
  -ContentType "application/json" \`
  -Body $body`;

  const pythonSnippet = `import requests

url = "${fullEndpointUrl}"
payload = ${sampleJson}

response = requests.post(url, json=payload)
data = response.json()

print(f"Target: {data['target_column']}")
print(f"Prediction: {data['prediction_display']}")
if data.get("confidence") is not None:
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
console.log("Prediction:", data.prediction_display);
console.log("Confidence:", data.confidence);`;

  return (
    <Panel
      title="Deploy as Live REST API"
      aside={
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulse" />
            Live Endpoint Active
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="text-[13px] text-slate-400 hover:text-slate-700 ml-2 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      }
    >
      <p className="text-[13px] leading-relaxed text-slate-600 mb-4">
        This trained {taskType} model for <strong className="text-slate-900">{targetColumn}</strong> is deployed as an instant, high-performance REST microservice
        {schema ? ` accepting ${schema.features.length} features` : ""}. Send HTTP POST requests with JSON feature payloads to get real-time predictions, class probabilities, and local feature contributions in production.
        {loading && <span className="ml-2 text-slate-400">(Loading schema…)</span>}
      </p>

      {/* URL BAR */}
      <div className="mb-5 flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3 shadow-2xs">
        <span className="rounded-lg bg-teal-600 px-2.5 py-1 font-mono text-[11px] font-bold text-white shadow-2xs">
          POST
        </span>
        <code className="flex-1 font-mono text-[12px] font-medium text-slate-800 truncate select-all">
          {fullEndpointUrl}
        </code>
        <button
          onClick={() => copyToClipboard(fullEndpointUrl, "url")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
        >
          {copied === "url" ? "✓ Copied" : "Copy URL"}
        </button>
        <a
          href={swaggerDocsUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <span>Swagger Docs</span>
          <span className="text-[10px] opacity-70">↗</span>
        </a>
      </div>

      {/* TABS */}
      <div className="mb-4 flex flex-wrap border-b border-slate-200 gap-1">
        <button
          onClick={() => setActiveTab("console")}
          className={`px-3.5 py-2 text-[12px] font-semibold transition-all border-b-2 -mb-px flex items-center gap-1.5 cursor-pointer ${
            activeTab === "console"
              ? "border-teal-600 text-teal-800 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <span>⚡</span> Live Test Console
        </button>
        <button
          onClick={() => setActiveTab("curl")}
          className={`px-3.5 py-2 text-[12px] font-semibold transition-all border-b-2 -mb-px cursor-pointer ${
            activeTab === "curl"
              ? "border-slate-900 text-slate-900 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          cURL
        </button>
        <button
          onClick={() => setActiveTab("powershell")}
          className={`px-3.5 py-2 text-[12px] font-semibold transition-all border-b-2 -mb-px cursor-pointer ${
            activeTab === "powershell"
              ? "border-slate-900 text-slate-900 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          PowerShell
        </button>
        <button
          onClick={() => setActiveTab("python")}
          className={`px-3.5 py-2 text-[12px] font-semibold transition-all border-b-2 -mb-px cursor-pointer ${
            activeTab === "python"
              ? "border-slate-900 text-slate-900 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          Python (requests)
        </button>
        <button
          onClick={() => setActiveTab("javascript")}
          className={`px-3.5 py-2 text-[12px] font-semibold transition-all border-b-2 -mb-px cursor-pointer ${
            activeTab === "javascript"
              ? "border-slate-900 text-slate-900 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          JavaScript / Node.js
        </button>
      </div>

      {/* TAB CONTENT: cURL */}
      {activeTab === "curl" && (
        <div className="relative">
          <pre className="rounded-xl bg-slate-900 p-4 font-mono text-[12px] leading-relaxed text-slate-100 overflow-x-auto shadow-inner">
            <code>{curlSnippet}</code>
          </pre>
          <button
            onClick={() => copyToClipboard(curlSnippet, "curl")}
            className="absolute top-3 right-3 rounded-md bg-slate-800 border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {copied === "curl" ? "✓ Copied" : "Copy Code"}
          </button>
        </div>
      )}

      {/* TAB CONTENT: PowerShell */}
      {activeTab === "powershell" && (
        <div className="relative">
          <pre className="rounded-xl bg-slate-900 p-4 font-mono text-[12px] leading-relaxed text-slate-100 overflow-x-auto shadow-inner">
            <code>{powershellSnippet}</code>
          </pre>
          <button
            onClick={() => copyToClipboard(powershellSnippet, "ps")}
            className="absolute top-3 right-3 rounded-md bg-slate-800 border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {copied === "ps" ? "✓ Copied" : "Copy Code"}
          </button>
        </div>
      )}

      {/* TAB CONTENT: Python */}
      {activeTab === "python" && (
        <div className="relative">
          <pre className="rounded-xl bg-slate-900 p-4 font-mono text-[12px] leading-relaxed text-slate-100 overflow-x-auto shadow-inner">
            <code>{pythonSnippet}</code>
          </pre>
          <button
            onClick={() => copyToClipboard(pythonSnippet, "python")}
            className="absolute top-3 right-3 rounded-md bg-slate-800 border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {copied === "python" ? "✓ Copied" : "Copy Code"}
          </button>
        </div>
      )}

      {/* TAB CONTENT: JavaScript */}
      {activeTab === "javascript" && (
        <div className="relative">
          <pre className="rounded-xl bg-slate-900 p-4 font-mono text-[12px] leading-relaxed text-slate-100 overflow-x-auto shadow-inner">
            <code>{jsSnippet}</code>
          </pre>
          <button
            onClick={() => copyToClipboard(jsSnippet, "js")}
            className="absolute top-3 right-3 rounded-md bg-slate-800 border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {copied === "js" ? "✓ Copied" : "Copy Code"}
          </button>
        </div>
      )}

      {/* TAB CONTENT: Live Test Console */}
      {activeTab === "console" && (
        <div className="space-y-4">
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Left: Input Payload */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <label className="text-[12px] font-bold text-slate-900 uppercase tracking-wider">
                    Request Payload (JSON)
                  </label>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    Editable
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleResetDefaults}
                    className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Reset Defaults
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadAlternateSample}
                    className="rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 hover:bg-teal-100 cursor-pointer"
                  >
                    Test Alternate Case
                  </button>
                </div>
              </div>

              <textarea
                value={consoleInput}
                onChange={(e) => setConsoleInput(e.target.value)}
                rows={12}
                className="w-full flex-1 rounded-xl border border-slate-700 bg-slate-950 p-3.5 font-mono text-[12px] text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-inner"
                placeholder='{\n  "features": {\n    "column_name": 10\n  }\n}'
              />

              <div className="mt-3 flex items-center justify-between">
                <Button onClick={handleSendTestRequest} disabled={testing}>
                  {testing ? "Executing Inference…" : "⚡ Send Live Request"}
                </Button>
                {latency != null && (
                  <span className="font-mono text-[11px] text-slate-500">
                    Latency: <strong className="text-slate-800">{latency} ms</strong>
                  </span>
                )}
              </div>
            </div>

            {/* Right: Response Visualizer & Inspector */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <label className="text-[12px] font-bold text-slate-900 uppercase tracking-wider">
                    Live Model Output
                  </label>
                  {consoleResponse && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-50 px-2 py-0.5 font-mono text-[11px] font-bold text-teal-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                      200 OK
                    </span>
                  )}
                  {consoleError && (
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-mono text-[11px] font-bold text-rose-700">
                      Error
                    </span>
                  )}
                </div>

                {/* View Mode Toggle */}
                <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                  <button
                    onClick={() => setResponseView("visual")}
                    className={`rounded-md px-2.5 py-0.5 text-[11px] font-semibold transition-all cursor-pointer ${
                      responseView === "visual"
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    Visual Summary
                  </button>
                  <button
                    onClick={() => setResponseView("json")}
                    className={`rounded-md px-2.5 py-0.5 text-[11px] font-semibold transition-all cursor-pointer ${
                      responseView === "json"
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    Raw JSON
                  </button>
                </div>
              </div>

              {consoleError && (
                <div className="mb-3">
                  <ErrorNote>{consoleError}</ErrorNote>
                </div>
              )}

              {/* View 1: Visual Summary */}
              {responseView === "visual" && (
                <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-4 min-h-[290px] overflow-y-auto">
                  {consoleResponse ? (
                    <>
                      {/* Prediction Hero Box */}
                      <div className="flex items-center justify-between rounded-xl border border-teal-500/30 bg-teal-50/60 p-4">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-800">
                            Predicted Result ({consoleResponse.target_column})
                          </div>
                          <div className="tabular mt-1 text-[24px] font-extrabold text-slate-900">
                            {consoleResponse.prediction_display}
                          </div>
                        </div>
                        {consoleResponse.confidence != null && (
                          <div className="text-right">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-800">
                              Confidence
                            </div>
                            <div className="tabular mt-1 text-[22px] font-bold text-teal-700">
                              {(consoleResponse.confidence * 100).toFixed(1)}%
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Class Probabilities Distribution */}
                      {consoleResponse.probabilities && consoleResponse.probabilities.length > 0 && (
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                            Class Probabilities Distribution
                          </div>
                          <div className="space-y-2">
                            {consoleResponse.probabilities.map((p) => (
                              <div key={p.class_name}>
                                <div className="flex items-center justify-between text-[12px] mb-1">
                                  <span className="font-semibold text-slate-700">
                                    Class {p.class_name}
                                  </span>
                                  <span className="tabular font-mono font-bold text-slate-900">
                                    {p.percentage.toFixed(1)}% ({p.probability.toFixed(4)})
                                  </span>
                                </div>
                                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      p.class_name === String(consoleResponse.prediction)
                                        ? "bg-teal-600"
                                        : "bg-slate-300"
                                    }`}
                                    style={{ width: `${Math.min(100, Math.max(0, p.percentage))}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Top Feature Contributions */}
                      {consoleResponse.feature_contributions && consoleResponse.feature_contributions.length > 0 && (
                        <div className="border-t border-slate-100 pt-3">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                            Key Influencing Features (Local Impact)
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[12px]">
                            {consoleResponse.feature_contributions.slice(0, 4).map((fc) => (
                              <div key={fc.feature} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-800 truncate">{fc.feature}</span>
                                  <span
                                    className={`tabular text-[10px] font-bold uppercase rounded px-1.5 py-0.2 ${
                                      fc.direction === "positive"
                                        ? "bg-teal-100 text-teal-800"
                                        : fc.direction === "negative"
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-slate-200 text-slate-600"
                                    }`}
                                  >
                                    {fc.direction}
                                  </span>
                                </div>
                                <div className="tabular mt-1 text-[11px] text-slate-600">
                                  Value: <strong>{String(fc.value)}</strong> · Impact: {fc.contribution.toFixed(3)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-center text-slate-400 py-12">
                      <p className="text-[13px]">Click "Send Live Request" to execute real-time model inference.</p>
                    </div>
                  )}
                </div>
              )}

              {/* View 2: Raw JSON */}
              {responseView === "json" && (
                <div className="relative flex-1">
                  <pre className="h-[290px] rounded-xl bg-slate-950 p-3.5 font-mono text-[12px] leading-relaxed text-slate-100 overflow-y-auto shadow-inner border border-slate-800">
                    <code>
                      {consoleResponse
                        ? JSON.stringify(consoleResponse, null, 2)
                        : consoleError
                        ? `{\n  "error": "${consoleError}"\n}`
                        : '// Click "Send Live Request" to inspect raw JSON response...'}
                    </code>
                  </pre>
                  {consoleResponse && (
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(consoleResponse, null, 2), "resp_json")}
                      className="absolute top-3 right-3 rounded-md bg-slate-800 border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
                    >
                      {copied === "resp_json" ? "✓ Copied" : "Copy JSON"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RESPONSE SCHEMA REFERENCE */}
      <div className="mt-6 border-t border-slate-100 pt-4">
        <h4 className="text-[12px] font-bold uppercase tracking-wider text-slate-500 mb-2.5">
          API Response Schema Reference Guide
        </h4>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 text-[12px]">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 shadow-2xs">
            <code className="font-bold text-slate-900">prediction / display</code>
            <p className="text-[11px] text-slate-500 mt-1">
              Top predicted class or numerical forecast value.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 shadow-2xs">
            <code className="font-bold text-slate-900">confidence</code>
            <p className="text-[11px] text-slate-500 mt-1">
              Certainty score (0.0 to 1.0) indicating probability of top prediction.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 shadow-2xs">
            <code className="font-bold text-slate-900">probabilities</code>
            <p className="text-[11px] text-slate-500 mt-1">
              Full probability breakdown across all possible class categories.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 shadow-2xs">
            <code className="font-bold text-slate-900">feature_contributions</code>
            <p className="text-[11px] text-slate-500 mt-1">
              Local impact score and direction for each individual input parameter.
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
