'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Key, ShieldCheck, FileText, Copy, Check,
  ChevronDown, ChevronRight, Terminal, BookOpen, ArrowLeft,
  ExternalLink, Server, Lock, Zap, AlertCircle,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface EndpointDoc {
  id: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  title: string;
  description: string;
  auth: 'api-key' | 'session';
  body?: { name: string; type: string; required: boolean; description: string }[];
  query?: { name: string; type: string; required: boolean; description: string }[];
  headers?: { name: string; value: string; description: string }[];
  responseExample: string;
  curlExample: string;
  responseSchema: string;
}

interface SchemaDoc {
  name: string;
  description: string;
  fields: { name: string; type: string; description: string }[];
}

// ─── Data ────────────────────────────────────────────────────────────────────

const ENDPOINTS: EndpointDoc[] = [
  {
    id: 'create-api-key',
    method: 'POST',
    path: '/api/api-keys',
    title: 'Create API Key',
    description:
      'Create a new API key for programmatic access. The raw key is returned only once — save it immediately. Requires a valid Supabase session (dashboard login).',
    auth: 'session',
    body: [
      { name: 'name', type: 'string', required: true, description: 'Descriptive name for the key (e.g., "CI/CD Server")' },
      { name: 'scope', type: 'string[]', required: false, description: 'Permission scopes (default: [])' },
      { name: 'expiresAt', type: 'string (ISO 8601)', required: false, description: 'Expiration date, e.g. "2026-12-31T23:59:59Z"' },
    ],
    responseExample: `{
  "success": true,
  "key": {
    "id": "uuid",
    "name": "CI/CD Server",
    "keyPrefix": "sa_live_a1b2c3d4",
    "scope": [],
    "expiresAt": "2026-12-31T23:59:59.000Z",
    "lastUsedAt": null,
    "createdAt": "2026-07-29T10:00:00.000Z"
  },
  "rawKey": "sa_live_a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef12345678",
  "message": "Save this key now — it will not be shown again."
}`,
    curlExample: `curl -X POST https://scaudit.vercel.app/api/api-keys \\
  -H "Content-Type: application/json" \\
  -H "Cookie: <your-supabase-session>" \\
  -d '{"name": "CI/CD Server", "expiresAt": "2026-12-31T23:59:59Z"}'`,
    responseSchema: '{ success, key: { id, name, keyPrefix, scope, expiresAt, lastUsedAt, createdAt }, rawKey, message }',
  },
  {
    id: 'list-api-keys',
    method: 'GET',
    path: '/api/api-keys',
    title: 'List API Keys',
    description:
      'List all API keys for the authenticated user. The full secret key is never returned — only the prefix is shown for identification.',
    auth: 'session',
    query: [],
    responseExample: `{
  "success": true,
  "keys": [
    {
      "id": "uuid",
      "name": "CI/CD Server",
      "keyPrefix": "sa_live_a1b2c3d4",
      "scope": [],
      "expiresAt": "2026-12-31T23:59:59.000Z",
      "lastUsedAt": "2026-07-28T15:30:00.000Z",
      "createdAt": "2026-07-01T10:00:00.000Z"
    }
  ]
}`,
    curlExample: `curl https://scaudit.vercel.app/api/api-keys \\
  -H "Cookie: <your-supabase-session>"`,
    responseSchema: '{ success, keys: [{ id, name, keyPrefix, scope, expiresAt, lastUsedAt, createdAt }] }',
  },
  {
    id: 'revoke-api-key',
    method: 'DELETE',
    path: '/api/api-keys?id=<keyId>',
    title: 'Revoke API Key',
    description:
      'Revoke (delete) an API key by ID. After revocation, any services using this key will immediately lose access.',
    auth: 'session',
    query: [
      { name: 'id', type: 'string (UUID)', required: true, description: 'ID of the API key to revoke' },
    ],
    responseExample: `{
  "success": true,
  "message": "API key revoked"
}`,
    curlExample: `curl -X DELETE "https://scaudit.vercel.app/api/api-keys?id=<key-uuid>" \\
  -H "Cookie: <your-supabase-session>"`,
    responseSchema: '{ success, message }',
  },
  {
    id: 'list-investigations',
    method: 'GET',
    path: '/api/public/v1/intelligence',
    title: 'List / Get Investigations',
    description:
      'List all infrastructure investigations for a project, or get detailed results (findings + assets) for a specific investigation.',
    auth: 'api-key',
    query: [
      { name: 'projectId', type: 'string (UUID)', required: true, description: 'Project ID (required for listing)' },
      { name: 'investigationId', type: 'string (UUID)', required: false, description: 'Specific investigation to fetch details for' },
    ],
    headers: [
      { name: 'Authorization', value: 'Bearer sa_live_<key>', description: 'API key with scan permissions' },
    ],
    responseExample: `// Listing:
{
  "success": true,
  "investigations": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "title": "Auditoria de Infraestructura para example.com",
      "target": "example.com",
      "targetType": "domain",
      "status": "completed",
      "score": 72,
      "createdAt": "2026-07-29T10:00:00.000Z"
    }
  ]
}

// Detail (with investigationId):
{
  "success": true,
  "investigation": { ... },
  "findings": 15,
  "assets": 8,
  "data": {
    "investigation": { ... },
    "findings": [ { severity, title, description, ... } ],
    "assets": [ { assetType, value, ip, ... } ]
  }
}`,
    curlExample: `# List investigations for a project
curl "https://scaudit.vercel.app/api/public/v1/intelligence?projectId=<uuid>" \\
  -H "Authorization: Bearer sa_live_<your-key>"

# Get details of a specific investigation
curl "https://scaudit.vercel.app/api/public/v1/intelligence?investigationId=<uuid>" \\
  -H "Authorization: Bearer sa_live_<your-key>"`,
    responseSchema: '{ success, investigations?: [...], investigation?: {...}, findings?: number, assets?: number, data?: { investigation, findings, assets } }',
  },
  {
    id: 'start-scan',
    method: 'POST',
    path: '/api/public/v1/intelligence',
    title: 'Start Infrastructure Scan',
    description:
      'Launch a full infrastructure security scan against a target. Runs 21+ tools asynchronously (DNS, TLS, email security, network, OSINT). Returns immediately with the investigation ID — poll GET to check completion.',
    auth: 'api-key',
    body: [
      { name: 'target', type: 'string', required: true, description: 'Target to scan (domain, IP, email, URL, ASN, or CIDR)' },
      { name: 'projectId', type: 'string (UUID)', required: true, description: 'Project ID to associate the scan with' },
    ],
    headers: [
      { name: 'Authorization', value: 'Bearer sa_live_<key>', description: 'API key with scan permissions' },
    ],
    responseExample: `{
  "success": true,
  "investigation": {
    "id": "uuid",
    "title": "Auditoria de Infraestructura para example.com",
    "target": "example.com",
    "normalizedTarget": "example.com",
    "targetType": "domain",
    "status": "running",
    "createdAt": "2026-07-29T10:00:00.000Z"
  },
  "message": "Scan started. Check status via GET /api/public/v1/intelligence?investigationId=<id>"
}`,
    curlExample: `curl -X POST https://scaudit.vercel.app/api/public/v1/intelligence \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sa_live_<your-key>" \\
  -d '{"target": "example.com", "projectId": "<project-uuid>"}'`,
    responseSchema: '{ success, investigation: { id, title, target, normalizedTarget, targetType, status, createdAt }, message }',
  },
  {
    id: 'generate-pdf',
    method: 'POST',
    path: '/api/reports/pdf',
    title: 'Generate PDF Report',
    description:
      'Generate a downloadable white-label PDF security report with full findings, severity breakdown, and MITRE ATT&CK mapping. Optionally include custom branding (logo, agency name, primary color).',
    auth: 'session',
    body: [
      { name: 'projectId', type: 'string (UUID)', required: true, description: 'Project ID' },
      { name: 'investigationId', type: 'string (UUID)', required: false, description: 'Specific investigation (default: latest 20)' },
      { name: 'branding', type: 'object', required: false, description: 'White-label branding: { agencyName, logoUrl, primaryColor }' },
    ],
    responseExample: `Binary PDF stream (Content-Type: application/pdf)

The PDF includes:
- Cover page with logo, project name, security score gauge
- Per-investigation detail pages with findings cards
- Consolidated findings table
- MITRE ATT&CK technique badges`,
    curlExample: `curl -X POST https://scaudit.vercel.app/api/reports/pdf \\
  -H "Content-Type: application/json" \\
  -H "Cookie: <your-supabase-session>" \\
  -d '{
    "projectId": "<uuid>",
    "branding": {
      "agencyName": "My Agency",
      "logoUrl": "https://example.com/logo.png"
    }
  }' \\
  --output report.pdf`,
    responseSchema: 'Binary PDF (Content-Type: application/pdf, Content-Disposition: attachment)',
  },
];

const SCHEMAS: SchemaDoc[] = [
  {
    name: 'ApiKey',
    description: 'Represents a developer API key for programmatic access.',
    fields: [
      { name: 'id', type: 'string (UUID)', description: 'Unique identifier' },
      { name: 'name', type: 'string', description: 'Descriptive name for the key' },
      { name: 'keyPrefix', type: 'string', description: 'First 12 characters of the key for UI display (e.g. "sa_live_a1b2")' },
      { name: 'scope', type: 'string[]', description: 'Permission scopes assigned to this key' },
      { name: 'expiresAt', type: 'string | null', description: 'ISO 8601 expiration date, or null for never-expiring' },
      { name: 'lastUsedAt', type: 'string | null', description: 'ISO 8601 timestamp of last authentication' },
      { name: 'createdAt', type: 'string', description: 'ISO 8601 creation timestamp' },
    ],
  },
  {
    name: 'Investigation',
    description: 'An infrastructure security investigation (scan session).',
    fields: [
      { name: 'id', type: 'string (UUID)', description: 'Unique identifier' },
      { name: 'projectId', type: 'string (UUID)', description: 'Associated project' },
      { name: 'title', type: 'string', description: 'Human-readable title' },
      { name: 'target', type: 'string', description: 'Original target input' },
      { name: 'targetType', type: 'string', description: 'One of: domain, hostname, url, ip, email, asn, cidr' },
      { name: 'status', type: 'string', description: 'One of: draft, queued, running, completed, failed, canceled' },
      { name: 'score', type: 'number | null', description: 'Security score 0-100, null if not yet scored' },
      { name: 'summary', type: 'string | null', description: 'Executive summary text' },
      { name: 'metadata', type: 'object', description: 'Additional scan metadata (asnGeo, traceroute, cdnWaf, etc.)' },
    ],
  },
  {
    name: 'Finding',
    description: 'A security finding or vulnerability detected during a scan.',
    fields: [
      { name: 'id', type: 'string (UUID)', description: 'Unique identifier' },
      { name: 'severity', type: 'string', description: 'One of: info, low, medium, high, critical' },
      { name: 'title', type: 'string', description: 'Short finding title' },
      { name: 'description', type: 'string', description: 'Detailed description' },
      { name: 'recommendation', type: 'string | null', description: 'Recommended remediation steps' },
      { name: 'affectedAsset', type: 'string | null', description: 'Affected hostname, IP, or resource' },
      { name: 'confidence', type: 'number', description: 'Confidence score 0.000 - 1.000' },
      { name: 'evidence', type: 'object', description: 'Raw evidence data from the scan tool' },
    ],
  },
  {
    name: 'Asset',
    description: 'A discovered asset (subdomain, IP, certificate, etc.).',
    fields: [
      { name: 'id', type: 'string (UUID)', description: 'Unique identifier' },
      { name: 'assetType', type: 'string', description: 'Type: subdomain, ip_address, certificate, email, etc.' },
      { name: 'value', type: 'string', description: 'The asset value (e.g. "mail.example.com", "192.168.1.1")' },
      { name: 'ip', type: 'string | null', description: 'Resolved IP address' },
      { name: 'firstSeenAt', type: 'string', description: 'ISO 8601 timestamp of first discovery' },
      { name: 'lastSeenAt', type: 'string', description: 'ISO 8601 timestamp of last confirmation' },
    ],
  },
];

// ─── Copy Button ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1.5 text-[10px] font-bold text-muted-fg hover:text-primary transition-colors cursor-pointer"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-chartreuse" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

// ─── Method Badge ────────────────────────────────────────────────────────────

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-chartreuse/15 text-chartreuse border-chartreuse/30',
    POST: 'bg-primary/15 text-primary border-primary/30',
    DELETE: 'bg-destructive/15 text-destructive border-destructive/30',
  };
  return (
    <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded border ${colors[method] || 'bg-muted/10 text-muted-fg border-border'} uppercase tracking-wider`}>
      {method}
    </span>
  );
}

// ─── Auth Badge ──────────────────────────────────────────────────────────────

function AuthBadge({ type }: { type: string }) {
  if (type === 'api-key') {
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
        <Key className="w-3 h-3" /> API Key
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
      <Lock className="w-3 h-3" /> Session
    </span>
  );
}

// ─── Endpoint Card ───────────────────────────────────────────────────────────

function EndpointCard({ ep, defaultOpen }: { ep: EndpointDoc; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-border rounded-2xl bg-muted/5 overflow-hidden transition-all duration-300 hover:border-primary/20">
      {/* Header — clickable */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-6 cursor-pointer hover:bg-muted/10 transition-colors text-left"
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <MethodBadge method={ep.method} />
          <code className="text-sm font-mono text-foreground/90 truncate">{ep.path}</code>
          <span className="text-sm font-semibold text-foreground/70 hidden sm:block shrink-0">{ep.title}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <AuthBadge type={ep.auth} />
          {open ? <ChevronDown className="w-4 h-4 text-muted-fg" /> : <ChevronRight className="w-4 h-4 text-muted-fg" />}
        </div>
      </button>

      {/* Details — collapsible */}
      {open && (
        <div className="px-6 pb-6 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
          <p className="text-sm text-muted-fg leading-relaxed">{ep.description}</p>

          {/* Headers */}
          {ep.headers && ep.headers.length > 0 && (
            <div>
              <h5 className="text-[10px] font-bold text-muted-fg uppercase tracking-widest mb-3">Required Headers</h5>
              <div className="space-y-2">
                {ep.headers.map((h, i) => (
                  <div key={i} className="flex items-start gap-3 text-xs">
                    <code className="text-primary font-mono shrink-0">{h.name}</code>
                    <code className="text-chartreuse font-mono shrink-0">{h.value}</code>
                    <span className="text-muted-fg">{h.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Query Params */}
          {ep.query && ep.query.length > 0 && (
            <div>
              <h5 className="text-[10px] font-bold text-muted-fg uppercase tracking-widest mb-3">Query Parameters</h5>
              <div className="overflow-hidden border border-border rounded-xl">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/10 text-muted-fg font-bold text-[9px] uppercase tracking-wider">
                      <th className="p-3 text-left">Name</th>
                      <th className="p-3 text-left">Type</th>
                      <th className="p-3 text-left">Required</th>
                      <th className="p-3 text-left">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {ep.query.map((q, i) => (
                      <tr key={i} className="hover:bg-muted/5">
                        <td className="p-3 font-mono text-primary">{q.name}</td>
                        <td className="p-3 font-mono text-muted-fg">{q.type}</td>
                        <td className="p-3">
                          {q.required
                            ? <span className="text-destructive font-bold">Required</span>
                            : <span className="text-muted-fg">Optional</span>}
                        </td>
                        <td className="p-3 text-muted-fg">{q.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Body Params */}
          {ep.body && ep.body.length > 0 && (
            <div>
              <h5 className="text-[10px] font-bold text-muted-fg uppercase tracking-widest mb-3">Request Body</h5>
              <div className="overflow-hidden border border-border rounded-xl">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/10 text-muted-fg font-bold text-[9px] uppercase tracking-wider">
                      <th className="p-3 text-left">Name</th>
                      <th className="p-3 text-left">Type</th>
                      <th className="p-3 text-left">Required</th>
                      <th className="p-3 text-left">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {ep.body.map((b, i) => (
                      <tr key={i} className="hover:bg-muted/5">
                        <td className="p-3 font-mono text-primary">{b.name}</td>
                        <td className="p-3 font-mono text-muted-fg">{b.type}</td>
                        <td className="p-3">
                          {b.required
                            ? <span className="text-destructive font-bold">Required</span>
                            : <span className="text-muted-fg">Optional</span>}
                        </td>
                        <td className="p-3 text-muted-fg">{b.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* cURL Example */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-[10px] font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" /> cURL Example
              </h5>
              <CopyButton text={ep.curlExample} />
            </div>
            <pre className="bg-black text-[11px] font-mono text-foreground/80 p-4 rounded-xl border border-border overflow-x-auto leading-relaxed">
              {ep.curlExample}
            </pre>
          </div>

          {/* Response */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-[10px] font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5" /> Response
              </h5>
              <CopyButton text={ep.responseExample} />
            </div>
            <pre className="bg-black text-[11px] font-mono text-foreground/80 p-4 rounded-xl border border-border overflow-x-auto leading-relaxed max-h-80 overflow-y-auto">
              {ep.responseExample}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Schema Card ─────────────────────────────────────────────────────────────

function SchemaCard({ schema }: { schema: SchemaDoc }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border rounded-2xl bg-muted/5 overflow-hidden transition-all duration-300 hover:border-primary/20">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 cursor-pointer hover:bg-muted/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-foreground font-mono">{schema.name}</span>
          <span className="text-[10px] text-muted-fg">{schema.description}</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted-fg" /> : <ChevronRight className="w-4 h-4 text-muted-fg" />}
      </button>
      {open && (
        <div className="px-5 pb-5 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="overflow-hidden border border-border rounded-xl">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/10 text-muted-fg font-bold text-[9px] uppercase tracking-wider">
                  <th className="p-3 text-left">Field</th>
                  <th className="p-3 text-left">Type</th>
                  <th className="p-3 text-left">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {schema.fields.map((f, i) => (
                  <tr key={i} className="hover:bg-muted/5">
                    <td className="p-3 font-mono text-primary">{f.name}</td>
                    <td className="p-3 font-mono text-chartreuse text-[10px]">{f.type}</td>
                    <td className="p-3 text-muted-fg">{f.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DocsApiPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Ambient background */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-to-b from-primary/5 to-transparent rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-16 space-y-12">

        {/* Header */}
        <div className="space-y-4">
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted-fg hover:text-primary transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">API Reference</h1>
              <p className="text-sm text-muted-fg mt-1">
                SCAUDIT REST API — automate infrastructure security scanning and integrate with your CI/CD pipeline.
              </p>
            </div>
          </div>
        </div>

        {/* Overview */}
        <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl p-8 space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" /> Quick Overview
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <Key className="w-4 h-4" />
                <span className="font-bold">Authentication</span>
              </div>
              <p className="text-muted-fg text-xs leading-relaxed">
                Public API endpoints use <code className="text-primary font-mono">Bearer sa_live_&lt;key&gt;</code>.
                Generate keys from the dashboard Settings → API Keys.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-chartreuse">
                <Server className="w-4 h-4" />
                <span className="font-bold">Base URL</span>
              </div>
              <p className="text-muted-fg text-xs leading-relaxed">
                All endpoints are served from{' '}
                <code className="text-chartreuse font-mono">https://scaudit.vercel.app</code>.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-amber-400">
                <AlertCircle className="w-4 h-4" />
                <span className="font-bold">Rate Limits</span>
              </div>
              <p className="text-muted-fg text-xs leading-relaxed">
                Public API: 30 scans/min per user. PDF reports: 5 req/60s.
                Rate limit responses return <code className="text-amber-400 font-mono">HTTP 429</code>.
              </p>
            </div>
          </div>
        </div>

        {/* Interactive tools grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Try-it link */}
          <Link
            href="/docs/api/playground"
            className="group block backdrop-blur-xl border border-chartreuse/20 bg-chartreuse/[0.02] rounded-2xl p-6 hover:border-chartreuse/40 hover:bg-chartreuse/[0.04] transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-chartreuse/10 border border-chartreuse/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Zap className="w-6 h-6 text-chartreuse" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight group-hover:text-chartreuse transition-colors">
                    Try it yourself ⚡
                  </h2>
                  <p className="text-sm text-muted-fg mt-0.5">
                    Execute real API calls from your browser.
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-chartreuse/50 group-hover:text-chartreuse group-hover:translate-x-1 transition-all">
                <ArrowLeft className="w-5 h-5 rotate-180" />
              </div>
            </div>
          </Link>

          {/* Swagger UI link */}
          <Link
            href="/swagger"
            className="group block backdrop-blur-xl border border-primary/20 bg-primary/[0.02] rounded-2xl p-6 hover:border-primary/40 hover:bg-primary/[0.04] transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <BookOpen className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight group-hover:text-primary transition-colors">
                    Swagger UI 🧪
                  </h2>
                  <p className="text-sm text-muted-fg mt-0.5">
                    Interactive API documentation with Try It Out, schema explorer, and auto-generated code snippets.
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-primary/50 group-hover:text-primary group-hover:translate-x-1 transition-all">
                <ArrowLeft className="w-5 h-5 rotate-180" />
              </div>
            </div>
          </Link>
        </div>

        {/* Authentication Guide */}
        <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl p-8 space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" /> Authentication Guide
          </h2>
          <div className="space-y-3 text-sm text-muted-fg leading-relaxed">
            <p>SCAUDIT uses two authentication methods depending on the endpoint:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-purple-400" />
                  <span className="font-bold text-foreground">API Key Auth</span>
                  <span className="text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Public API</span>
                </div>
                <p className="text-xs">Used by <code className="text-primary font-mono">/api/public/v1/*</code> endpoints.</p>
                <ol className="text-xs space-y-1 list-decimal list-inside text-muted-fg">
                  <li>Create a key from Settings → API Keys</li>
                  <li>Include <code className="text-primary font-mono">Authorization: Bearer sa_live_&lt;key&gt;</code></li>
                  <li>The key is hashed (SHA-256) — never stored in plaintext</li>
                </ol>
              </div>
              <div className="bg-card border border-border rounded-xl p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-primary" />
                  <span className="font-bold text-foreground">Session Auth</span>
                  <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Dashboard</span>
                </div>
                <p className="text-xs">Used by dashboard endpoints (API keys management, PDF reports).</p>
                <ol className="text-xs space-y-1 list-decimal list-inside text-muted-fg">
                  <li>Login via the dashboard at <code className="text-primary font-mono">/login</code></li>
                  <li>Supabase session cookie is automatically sent</li>
                  <li>All operations are scoped to your user (tenant isolation)</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* Endpoints */}
        <div className="space-y-4">
          <h2 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" /> Endpoints
          </h2>
          <p className="text-sm text-muted-fg -mt-2">
            {ENDPOINTS.length} endpoints available across public API and dashboard APIs.
          </p>
          <div className="space-y-3">
            {ENDPOINTS.map((ep, i) => (
              <EndpointCard key={ep.id} ep={ep} defaultOpen={i === 0} />
            ))}
          </div>
        </div>

        {/* Schemas */}
        <div className="space-y-4">
          <h2 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> Data Schemas
          </h2>
          <p className="text-sm text-muted-fg -mt-2">
            Common data types used across API responses.
          </p>
          <div className="space-y-3">
            {SCHEMAS.map((schema) => (
              <SchemaCard key={schema.name} schema={schema} />
            ))}
          </div>
        </div>

        {/* Error Codes */}
        <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl p-8 space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-destructive" /> Error Codes
          </h2>
          <div className="overflow-hidden border border-border rounded-xl">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/10 text-muted-fg font-bold text-[9px] uppercase tracking-wider">
                  <th className="p-3 text-left">Code</th>
                  <th className="p-3 text-left">Description</th>
                  <th className="p-3 text-left">Response Body</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                <tr className="hover:bg-muted/5"><td className="p-3 font-mono text-primary">400</td><td className="p-3 text-muted-fg">Bad request — missing or invalid parameters</td><td className="p-3 font-mono text-muted-fg text-[10px]">{'{ "success": false, "error": "..." }'}</td></tr>
                <tr className="hover:bg-muted/5"><td className="p-3 font-mono text-primary">401</td><td className="p-3 text-muted-fg">Unauthorized — missing or invalid API key</td><td className="p-3 font-mono text-muted-fg text-[10px]">{'{ "success": false, "error": "..." }'}</td></tr>
                <tr className="hover:bg-muted/5"><td className="p-3 font-mono text-primary">404</td><td className="p-3 text-muted-fg">Not found — project, investigation, or key not found</td><td className="p-3 font-mono text-muted-fg text-[10px]">{'{ "success": false, "error": "..." }'}</td></tr>
                <tr className="hover:bg-muted/5"><td className="p-3 font-mono text-primary">429</td><td className="p-3 text-muted-fg">Rate limit exceeded — slow down requests</td><td className="p-3 font-mono text-muted-fg text-[10px]">{'{ "success": false, "error": "Rate limit exceeded" }'}</td></tr>
                <tr className="hover:bg-muted/5"><td className="p-3 font-mono text-primary">500</td><td className="p-3 text-muted-fg">Internal server error — contact support if persistent</td><td className="p-3 font-mono text-muted-fg text-[10px]">{'{ "success": false, "error": "..." }'}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border pt-6 flex items-center justify-between text-xs text-muted-fg">
          <span>SCAUDIT · Enterprise Cyber Intelligence</span>
          <a href="https://scaudit.vercel.app" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary transition-colors">
            <ExternalLink className="w-3.5 h-3.5" /> scaudit.vercel.app
          </a>
        </div>
      </div>
    </div>
  );
}
