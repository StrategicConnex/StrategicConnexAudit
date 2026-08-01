'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Play, Terminal, Copy, Check, RotateCcw,
  ArrowLeft, Key, Zap, Server, Shield, BookOpen,
  ChevronDown, ChevronRight, Loader2, AlertCircle,
  Globe, Lock, Eye, EyeOff,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParamDef {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'uuid' | 'json';
  required: boolean;
  in: 'query' | 'body' | 'header';
  description: string;
  placeholder?: string;
}

interface PlaygroundEndpoint {
  id: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  title: string;
  description: string;
  auth: 'api-key' | 'session';
  params: ParamDef[];
  bodyTemplate?: string;
}

type Tab = 'params' | 'response' | 'curl';

interface LogEntry {
  id: number;
  method: string;
  path: string;
  status: number;
  duration: number;
  timestamp: Date;
  ok: boolean;
}

// ─── Color helpers ───────────────────────────────────────────────────────────

function methodColor(method: string): string {
  switch (method) {
    case 'GET':    return 'text-chartreuse border-chartreuse/30 bg-chartreuse/10';
    case 'POST':   return 'text-primary border-primary/30 bg-primary/10';
    case 'DELETE': return 'text-destructive border-destructive/30 bg-destructive/10';
    default:       return 'text-muted-fg border-border bg-muted/10';
  }
}

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return 'text-chartreuse';
  if (status === 429) return 'text-amber-400';
  if (status >= 400) return 'text-destructive';
  return 'text-muted-fg';
}

// ─── HTML entity escape ──────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c
  );
}

// ─── Data ────────────────────────────────────────────────────────────────────

const ENDPOINTS: PlaygroundEndpoint[] = [
  {
    id: 'list-investigations',
    method: 'GET',
    path: '/api/public/v1/intelligence',
    title: 'List Investigations',
    description: 'List infrastructure investigations for a project.',
    auth: 'api-key',
    params: [
      { name: 'projectId', type: 'uuid', required: true, in: 'query', description: 'Project UUID', placeholder: 'uuid-of-project' },
    ],
  },
  {
    id: 'get-investigation',
    method: 'GET',
    path: '/api/public/v1/intelligence',
    title: 'Get Investigation Detail',
    description: 'Get findings and assets for a specific investigation.',
    auth: 'api-key',
    params: [
      { name: 'investigationId', type: 'uuid', required: true, in: 'query', description: 'Investigation UUID', placeholder: 'uuid-of-investigation' },
    ],
  },
  {
    id: 'start-scan',
    method: 'POST',
    path: '/api/public/v1/intelligence',
    title: 'Start Infrastructure Scan',
    description: 'Launch a full infrastructure scan (DNS, TLS, email security, network). Returns immediately — poll GET to check completion.',
    auth: 'api-key',
    params: [
      { name: 'target', type: 'string', required: true, in: 'body', description: 'Target (domain, IP, email)', placeholder: 'example.com' },
      { name: 'projectId', type: 'uuid', required: true, in: 'body', description: 'Project UUID', placeholder: 'uuid-of-project' },
    ],
    bodyTemplate: '{\n  "target": "example.com",\n  "projectId": "uuid"\n}',
  },
  {
    id: 'list-keys',
    method: 'GET',
    path: '/api/api-keys',
    title: 'List API Keys',
    description: 'List all API keys for the authenticated user. The full secret is never returned — only the prefix.',
    auth: 'session',
    params: [],
  },
  {
    id: 'create-key',
    method: 'POST',
    path: '/api/api-keys',
    title: 'Create API Key',
    description: 'Create a new API key for programmatic access.',
    auth: 'session',
    params: [
      { name: 'name', type: 'string', required: true, in: 'body', description: 'Descriptive name for the key', placeholder: 'CI/CD Integration' },
    ],
    bodyTemplate: '{\n  "name": "CI/CD Integration"\n}',
  },
  {
    id: 'revoke-key',
    method: 'DELETE',
    path: '/api/api-keys',
    title: 'Revoke API Key',
    description: 'Revoke an API key by ID.',
    auth: 'session',
    params: [
      { name: 'id', type: 'uuid', required: true, in: 'query', description: 'Key ID to revoke', placeholder: 'uuid-of-key' },
    ],
  },
  {
    id: 'generate-pdf',
    method: 'POST',
    path: '/api/reports/pdf',
    title: 'Generate PDF Report',
    description: 'Generate a white-label PDF security report. Returns binary PDF.',
    auth: 'session',
    params: [
      { name: 'projectId', type: 'uuid', required: true, in: 'body', description: 'Project UUID', placeholder: 'uuid-of-project' },
    ],
    bodyTemplate: '{\n  "projectId": "uuid",\n  "branding": {\n    "agencyName": "My Agency"\n  }\n}',
  },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function EndpointSelector({
  endpoints,
  selected,
  onSelect,
}: {
  endpoints: PlaygroundEndpoint[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = endpoints.find((e) => e.id === selected);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 bg-black/40 backdrop-blur-sm border border-border rounded-2xl hover:border-primary/30 transition-all cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`shrink-0 text-[10px] font-extrabold px-2 py-1 rounded border uppercase tracking-wider ${methodColor(active?.method || 'GET')}`}>
            {active?.method || 'GET'}
          </span>
          <div className="min-w-0">
            <code className="text-sm font-mono text-foreground/90 truncate block">{active?.path}</code>
            <span className="text-[10px] text-muted-fg mt-0.5 block">{active?.title}</span>
          </div>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted-fg shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-fg shrink-0" />}
      </button>

      {open && (
        <div className="absolute z-20 top-full mt-2 left-0 right-0 bg-card border border-border rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="max-h-64 overflow-y-auto divide-y divide-border/50">
            {endpoints.map((ep) => (
              <button
                key={ep.id}
                onClick={() => { onSelect(ep.id); setOpen(false); }}
                className={`w-full flex items-center gap-3 p-4 text-left hover:bg-muted/10 transition-colors cursor-pointer ${
                  ep.id === selected ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                }`}
              >
                <span className={`shrink-0 text-[9px] font-extrabold px-2 py-0.5 rounded border uppercase tracking-wider ${methodColor(ep.method)}`}>
                  {ep.method}
                </span>
                <div className="min-w-0 flex-1">
                  <code className="text-xs font-mono text-foreground/80 block truncate">{ep.path}</code>
                  <span className="text-[9px] text-muted-fg block">{ep.title}</span>
                </div>
                {ep.auth === 'api-key' ? (
                  <span className="shrink-0 flex items-center gap-1 text-[8px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    <Key className="w-2.5 h-2.5" /> Key
                  </span>
                ) : (
                  <span className="shrink-0 flex items-center gap-1 text-[8px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    <Lock className="w-2.5 h-2.5" /> Sess
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ApiKeyInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-4 py-3 bg-black/40 backdrop-blur-sm border border-purple-500/20 rounded-xl focus-within:border-purple-500/50 transition-all">
        <Key className="w-4 h-4 text-purple-400 shrink-0" />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="sa_live_..."
          className="flex-1 bg-transparent text-xs font-mono text-foreground placeholder-muted-fg/50 outline-none"
        />
        <button
          onClick={() => setShow(!show)}
          className="text-muted-fg hover:text-foreground transition-colors cursor-pointer"
        >
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
      <p className="text-[9px] text-purple-400/60 mt-1 px-1">
        Your API key stays in this browser. We never send it anywhere except to SCAUDIT.
      </p>
    </div>
  );
}

function ParamInput({
  param,
  value,
  onChange,
}: {
  param: ParamDef;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-xs">
        <code className="font-mono text-primary">{param.name}</code>
        {param.required && <span className="text-destructive text-[9px] font-bold">Required</span>}
        <span className="text-muted-fg text-[9px]">{param.type}</span>
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={param.placeholder || param.name}
        className="w-full px-3.5 py-2.5 bg-black/40 backdrop-blur-sm border border-border rounded-xl text-xs font-mono text-foreground placeholder-muted-fg/40 outline-none focus:border-primary/40 transition-all"
      />
      <p className="text-[9px] text-muted-fg/60">{param.description}</p>
    </div>
  );
}

function HistoryLog({
  entries,
  onClear,
  onReplay,
}: {
  entries: LogEntry[];
  onClear: () => void;
  onReplay: (idx: number) => void;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold text-muted-fg uppercase tracking-widest">
          Request History ({entries.length})
        </h4>
        <button
          onClick={onClear}
          className="text-[9px] text-muted-fg hover:text-destructive transition-colors cursor-pointer"
        >
          Clear
        </button>
      </div>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {entries.map((entry, i) => (
          <button
            key={entry.id}
            onClick={() => onReplay(i)}
            className="w-full flex items-center gap-3 px-3 py-2 bg-black/30 border border-border rounded-lg hover:bg-muted/10 transition-all cursor-pointer text-left group"
          >
            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0 ${methodColor(entry.method)}`}>
              {entry.method}
            </span>
            <span className={`text-[10px] font-mono font-bold shrink-0 ${statusColor(entry.status)}`}>
              {entry.status}
            </span>
            <code className="text-[9px] font-mono text-muted-fg truncate flex-1">{entry.path}</code>
            <span className="text-[8px] text-muted-fg/50 shrink-0">{entry.duration}ms</span>
            <RotateCcw className="w-3 h-3 text-muted-fg/30 group-hover:text-primary transition-colors shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

function JsonView({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);

  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const copyBtn = (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 text-[9px] font-bold text-muted-fg hover:text-primary transition-colors cursor-pointer"
    >
      {copied ? <Check className="w-3 h-3 text-chartreuse" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-[10px] font-bold text-muted-fg uppercase tracking-widest">Response Body</h5>
        {copyBtn}
      </div>
      <pre className="bg-black/60 text-[10px] font-mono leading-relaxed p-4 rounded-xl border border-border overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap break-all">
        {text ? (
          <SyntaxHighlight json={escapeHtml(text)} />
        ) : (
          <span className="text-muted-fg italic">No response body</span>
        )}
      </pre>
    </div>
  );
}

function SyntaxHighlight({ json }: { json: string }) {
  // Simple JSON syntax highlighting on sanitized HTML-escaped text
  const highlighted = json
    .replace(/&quot;([^&]*)&quot;\s*:/g, '<span class="text-primary">"$1"</span>:')
    .replace(/&quot;([^&]*)&quot;/g, '<span class="text-chartreuse">"$1"</span>')
    .replace(/\b(true|false)\b/g, '<span class="text-amber-400">$1</span>')
    .replace(/\b(null)\b/g, '<span class="text-muted-fg/50">$1</span>')
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="text-purple-400">$1</span>');

  return <span dangerouslySetInnerHTML={{ __html: highlighted }} />;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ApiPlaygroundPage() {
  const [apiKey, setApiKey] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState('list-investigations');
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [bodyRaw, setBodyRaw] = useState('');
  const [bodyMode, setBodyMode] = useState<'form' | 'raw'>('form');
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseBody, setResponseBody] = useState<unknown>(null);
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});
  const [responseDuration, setResponseDuration] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('params');
  const [history, setHistory] = useState<LogEntry[]>([]);
  const historyCounter = useRef(0);
  const responseRef = useRef<HTMLDivElement>(null);

  const endpoint = ENDPOINTS.find((e) => e.id === selectedEndpoint)!;

  // Reset params when endpoint changes
  useEffect(() => {
    setParamValues({});
    setBodyRaw('');
    setResponseStatus(null);
    setResponseBody(null);
    setErrorMsg(null);
    setActiveTab('params');
  }, [selectedEndpoint]);

  // Use relative origin so it works in dev (localhost) and production (same-origin)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://scaudit.vercel.app';

  const buildUrl = useCallback(() => {
    const url = new URL(endpoint.path, baseUrl);
    for (const p of endpoint.params) {
      if (p.in === 'query' && paramValues[p.name]) {
        url.searchParams.set(p.name, paramValues[p.name]);
      }
    }
    return url.toString();
  }, [endpoint, paramValues, baseUrl]);

  const buildHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {};
    // Only set Content-Type when there's a body
    if (endpoint.method === 'POST') {
      headers['Content-Type'] = 'application/json';
    }
    if (endpoint.auth === 'api-key' && apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    return headers;
  }, [endpoint, apiKey]);

  const buildBody = useCallback((): string | undefined => {
    if (endpoint.method === 'GET' || endpoint.method === 'DELETE') return undefined;

    if (bodyMode === 'raw' && bodyRaw) return bodyRaw;

    const bodyParams = endpoint.params.filter((p) => p.in === 'body');
    if (bodyParams.length === 0) return undefined;

    const obj: Record<string, unknown> = {};
    for (const p of bodyParams) {
      if (paramValues[p.name]) {
        obj[p.name] = paramValues[p.name];
      }
    }
    return Object.keys(obj).length > 0 ? JSON.stringify(obj, null, 2) : undefined;
  }, [endpoint, paramValues, bodyMode, bodyRaw]);

  const missingRequired = useCallback((): string[] => {
    const missing: string[] = [];
    for (const p of endpoint.params) {
      if (p.required && !paramValues[p.name]) {
        missing.push(p.name);
      }
    }
    return missing;
  }, [endpoint, paramValues]);

  const handleSend = useCallback(async () => {
    const missing = missingRequired();
    if (missing.length > 0) {
      setErrorMsg(`Missing required fields: ${missing.join(', ')}`);
      setActiveTab('response');
      return;
    }

    if (endpoint.auth === 'api-key' && !apiKey) {
      setErrorMsg('Enter your API Key first (required for this endpoint)');
      setActiveTab('response');
      return;
    }

    if (endpoint.auth === 'session') {
      setErrorMsg('This endpoint requires dashboard session auth. Login at /login first, then use the dashboard.');
      setActiveTab('response');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setResponseStatus(null);
    setResponseBody(null);
    setActiveTab('response');

    const startTime = performance.now();

    try {
      const res = await fetch(buildUrl(), {
        method: endpoint.method,
        headers: buildHeaders(),
        body: buildBody(),
      });

      const duration = Math.round(performance.now() - startTime);
      setResponseDuration(duration);
      setResponseStatus(res.status);

      // Collect response headers
      const hdrs: Record<string, string> = {};
      res.headers.forEach((v, k) => { hdrs[k] = v; });
      setResponseHeaders(hdrs);

      // Parse body
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const json = await res.json();
        setResponseBody(json);
      } else if (ct.includes('application/pdf')) {
        setResponseBody('[Binary PDF content — download only]');
      } else {
        const text = await res.text();
        setResponseBody(text.length > 5000 ? text.slice(0, 5000) + '\n\n... (truncated)' : text);
      }

      // Add to history
      const entry: LogEntry = {
        id: ++historyCounter.current,
        method: endpoint.method,
        path: endpoint.path,
        status: res.status,
        duration,
        timestamp: new Date(),
        ok: res.ok,
      };
      setHistory((prev) => [entry, ...prev].slice(0, 50));

    } catch (err: unknown) {
      const duration = Math.round(performance.now() - startTime);
      setResponseDuration(duration);
      // Handle CORS / network errors gracefully
      const msg = err instanceof Error ? err.message : 'Request failed';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setErrorMsg('Network error — this might be a CORS issue. The playground works best when served from the same origin as the API (scaudit.vercel.app). In development, make sure the dev server is running on localhost:3000.');
      } else {
        setErrorMsg(msg);
      }
      setResponseBody(null);

      const entry: LogEntry = {
        id: ++historyCounter.current,
        method: endpoint.method,
        path: endpoint.path,
        status: 0,
        duration,
        timestamp: new Date(),
        ok: false,
      };
      setHistory((prev) => [entry, ...prev].slice(0, 50));
    } finally {
      setLoading(false);
      setTimeout(() => responseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    }
  }, [endpoint, apiKey, paramValues, bodyMode, bodyRaw, missingRequired, buildUrl, buildHeaders, buildBody]);

  const handleReplay = useCallback((idx: number) => {
    const entry = history[idx];
    const ep = ENDPOINTS.find((e) => e.path === entry.path && e.method === entry.method);
    if (ep) {
      setSelectedEndpoint(ep.id);
    }
  }, [history]);

  const handleClearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  // Generate cURL for current configuration
  const curlCommand = useCallback((): string => {
    const headers = buildHeaders();
    const body = buildBody();
    const url = buildUrl();
    let curl = `curl -X ${endpoint.method} \\\n  "${url}"`;
    for (const [k, v] of Object.entries(headers)) {
      curl += ` \\\n  -H "${k}: ${v}"`;
    }
    if (body) {
      curl += ` \\\n  -d '${body}'`;
    }
    return curl;
  }, [endpoint, buildUrl, buildHeaders, buildBody]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Ambient background */}
      <div className="fixed top-0 left-1/3 w-[500px] h-[500px] bg-gradient-to-b from-primary/[0.03] to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-[400px] h-[400px] bg-gradient-to-t from-purple-500/[0.03] to-transparent rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-12 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Link href="/docs/api" className="inline-flex items-center gap-1.5 text-[10px] text-muted-fg hover:text-primary transition-colors">
              <ArrowLeft className="w-3 h-3" /> Back to API Reference
            </Link>
            <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              API Playground
            </h1>
            <p className="text-xs text-muted-fg">
              Execute real API calls against SCAUDIT&apos;s infrastructure intelligence API.
              Enter your API key, select an endpoint, and hit <strong className="text-foreground">Send</strong>.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* ── Left Column: Auth + Config ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* API Key Input */}
            <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-bold flex items-center gap-2">
                <Key className="w-3.5 h-3.5 text-purple-400" /> API Key
              </h3>
              <ApiKeyInput value={apiKey} onChange={setApiKey} />
              {!apiKey && endpoint.auth === 'api-key' && (
                <p className="text-[10px] text-amber-400/70 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> This endpoint requires an API Key
                </p>
              )}
            </div>

            {/* Base URL */}
            <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl p-5 space-y-2">
              <h3 className="text-xs font-bold flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-chartreuse" /> Base URL
              </h3>
              <code className="block text-xs font-mono text-chartreuse bg-black/40 px-3 py-2 rounded-xl border border-border">
                {baseUrl}
              </code>
            </div>

            {/* History */}
            <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl p-5">
              <HistoryLog entries={history} onClear={handleClearHistory} onReplay={handleReplay} />
              {history.length === 0 && (
                <div className="text-center py-6">
                  <Terminal className="w-8 h-8 text-muted-fg/20 mx-auto mb-2" />
                  <p className="text-[10px] text-muted-fg/40">No requests yet.</p>
                  <p className="text-[9px] text-muted-fg/30">Send your first request above.</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Right Column: Playground ── */}
          <div className="lg:col-span-3 space-y-5">

            {/* Endpoint Selector + Send */}
            <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-bold flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-primary" /> Endpoint
              </h3>
              <EndpointSelector
                endpoints={ENDPOINTS}
                selected={selectedEndpoint}
                onSelect={setSelectedEndpoint}
              />

              <div className="flex items-center gap-2 text-[10px] text-muted-fg bg-black/30 px-4 py-2 rounded-xl border border-border">
                <Shield className="w-3 h-3 text-primary" />
                {endpoint.description}
              </div>
            </div>

            {/* Tabs: Params / Response / cURL */}
            <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl overflow-hidden">
              {/* Tab bar */}
              <div className="flex border-b border-border">
                {(['params', 'response', 'curl'] as Tab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      activeTab === tab
                        ? 'text-primary border-b-2 border-primary bg-primary/5'
                        : 'text-muted-fg hover:text-foreground hover:bg-muted/5'
                    }`}
                  >
                    {tab === 'params' && 'Parameters'}
                    {tab === 'response' && 'Response'}
                    {tab === 'curl' && 'cURL'}
                  </button>
                ))}
              </div>

              <div className="p-5">

                {/* ── Params Tab ── */}
                {activeTab === 'params' && (
                  <div className="space-y-5">
                    {/* Query params */}
                    {endpoint.params.filter((p) => p.in === 'query').length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-[9px] font-bold text-muted-fg uppercase tracking-widest">Query Parameters</h4>
                        {endpoint.params.filter((p) => p.in === 'query').map((p) => (
                          <ParamInput
                            key={p.name}
                            param={p}
                            value={paramValues[p.name] || ''}
                            onChange={(v) => setParamValues((prev) => ({ ...prev, [p.name]: v }))}
                          />
                        ))}
                      </div>
                    )}

                    {/* Body params */}
                    {endpoint.params.filter((p) => p.in === 'body').length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[9px] font-bold text-muted-fg uppercase tracking-widest">Body Parameters</h4>
                          <div className="flex gap-1">
                            <button
                              onClick={() => setBodyMode('form')}
                              className={`text-[8px] font-bold px-2 py-1 rounded-full border uppercase tracking-wider transition-all cursor-pointer ${
                                bodyMode === 'form'
                                  ? 'text-primary border-primary bg-primary/10'
                                  : 'text-muted-fg border-border hover:text-foreground'
                              }`}
                            >
                              Form
                            </button>
                            <button
                              onClick={() => setBodyMode('raw')}
                              className={`text-[8px] font-bold px-2 py-1 rounded-full border uppercase tracking-wider transition-all cursor-pointer ${
                                bodyMode === 'raw'
                                  ? 'text-chartreuse border-chartreuse/50 bg-chartreuse/10'
                                  : 'text-muted-fg border-border hover:text-foreground'
                              }`}
                            >
                              Raw JSON
                            </button>
                          </div>
                        </div>

                        {bodyMode === 'form' ? (
                          endpoint.params.filter((p) => p.in === 'body').map((p) => (
                            <ParamInput
                              key={p.name}
                              param={p}
                              value={paramValues[p.name] || ''}
                              onChange={(v) => setParamValues((prev) => ({ ...prev, [p.name]: v }))}
                            />
                          ))
                        ) : (
                          <div>
                            <textarea
                              value={bodyRaw || endpoint.bodyTemplate || ''}
                              onChange={(e) => setBodyRaw(e.target.value)}
                              className="w-full h-36 bg-black/60 text-[10px] font-mono text-foreground p-4 rounded-xl border border-border focus:border-primary/40 transition-all outline-none resize-none"
                              placeholder="{}"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {endpoint.params.length === 0 && (
                      <div className="text-center py-8">
                        <Terminal className="w-8 h-8 text-muted-fg/20 mx-auto mb-2" />
                        <p className="text-xs text-muted-fg/60">No parameters required.</p>
                        <p className="text-[10px] text-muted-fg/40">This endpoint accepts no query or body parameters.</p>
                      </div>
                    )}

                    {/* Send button */}
                    <button
                      onClick={handleSend}
                      disabled={loading}
                      className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-xs font-bold tracking-wider transition-all cursor-pointer ${
                        loading
                          ? 'bg-primary/20 text-primary/50 cursor-not-allowed'
                          : 'bg-primary hover:bg-primary/90 text-primary-fg shadow-lg shadow-primary/20 hover:shadow-primary/30'
                      }`}
                    >
                      {loading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                      ) : (
                        <><Play className="w-4 h-4" /> Send Request</>
                      )}
                    </button>
                  </div>
                )}

                {/* ── Response Tab ── */}
                {activeTab === 'response' && (
                  <div ref={responseRef} className="space-y-4">

                    {errorMsg && (
                      <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-xl">
                        <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-destructive">Error</p>
                          <p className="text-[10px] text-destructive/80">{errorMsg}</p>
                        </div>
                      </div>
                    )}

                    {responseStatus !== null && (
                      <>
                        {/* Status bar */}
                        <div className="flex items-center gap-4 p-3 bg-black/40 border border-border rounded-xl">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-muted-fg uppercase tracking-widest">Status</span>
                            <span className={`text-sm font-extrabold font-mono ${statusColor(responseStatus)}`}>
                              {responseStatus}
                            </span>
                          </div>
                          <div className="h-4 w-px bg-border" />
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-muted-fg uppercase tracking-widest">Duration</span>
                            <span className="text-xs font-mono text-foreground/70">{responseDuration}ms</span>
                          </div>
                          <div className="h-4 w-px bg-border" />
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-muted-fg uppercase tracking-widest">Method</span>
                            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border uppercase ${methodColor(endpoint.method)}`}>
                              {endpoint.method}
                            </span>
                          </div>
                        </div>

                        {/* Response headers (collapsible) */}
                        <details className="group">
                          <summary className="flex items-center gap-1.5 text-[9px] font-bold text-muted-fg uppercase tracking-widest cursor-pointer hover:text-foreground transition-colors">
                            <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                            Response Headers ({Object.keys(responseHeaders).length})
                          </summary>
                          <div className="mt-2 bg-black/40 border border-border rounded-xl p-3 max-h-40 overflow-y-auto">
                            {Object.entries(responseHeaders).map(([k, v]) => (
                              <div key={k} className="flex items-start gap-3 py-1 text-[9px] border-b border-border/30 last:border-0">
                                <code className="text-primary font-mono shrink-0">{k}</code>
                                <code className="text-muted-fg font-mono break-all">{v}</code>
                              </div>
                            ))}
                          </div>
                        </details>

                        {/* Response body */}
                        {responseBody !== null && <JsonView data={responseBody} />}
                      </>
                    )}

                    {responseStatus === null && !errorMsg && (
                      <div className="text-center py-12">
                        <Play className="w-10 h-10 text-muted-fg/15 mx-auto mb-3" />
                        <p className="text-sm text-muted-fg/50">Waiting for your first request.</p>
                        <p className="text-[10px] text-muted-fg/30">Fill in parameters above and click Send.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── cURL Tab ── */}
                {activeTab === 'curl' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[9px] font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1.5">
                        <Terminal className="w-3 h-3" /> Generated Command
                      </h4>
                      <button
                        onClick={() => { navigator.clipboard.writeText(curlCommand()); }}
                        className="flex items-center gap-1 text-[9px] font-bold text-muted-fg hover:text-primary transition-colors cursor-pointer"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                    </div>
                    <pre className="bg-black/60 text-[10px] font-mono leading-relaxed p-4 rounded-xl border border-border overflow-x-auto whitespace-pre-wrap break-all">
                      {escapeHtml(curlCommand())}
                    </pre>
                    <p className="text-[9px] text-muted-fg/50">
                      Copy this command to run from your terminal. For session endpoints, replace with your Supabase cookie.
                    </p>
                  </div>
                )}

              </div>
            </div>

            {/* Quick Tips */}
            <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl p-5">
              <h4 className="text-[9px] font-bold text-muted-fg uppercase tracking-widest mb-3">Tips</h4>
              <ul className="space-y-2 text-[10px] text-muted-fg/70">
                <li className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                  <span>Get your API key from Settings → API Keys in the dashboard.</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full bg-chartreuse mt-1.5 shrink-0" />
                  <span>Session-only endpoints require a dashboard login — use the <code className="text-primary font-mono">/docs/api</code> reference with your browser cookies.</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <span>Rate limit: 60 requests/min per API key. HTTP 429 means slow down.</span>
                </li>
              </ul>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border pt-6 flex items-center justify-between text-[10px] text-muted-fg">
          <span>SCAUDIT · Enterprise Cyber Intelligence</span>
          <Link href="/docs/api" className="flex items-center gap-1 hover:text-primary transition-colors">
            <BookOpen className="w-3 h-3" /> API Reference
          </Link>
        </div>
      </div>
    </div>
  );
}
