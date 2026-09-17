'use client';

import { useState, useEffect, useCallback } from 'react';
import { Wrench, Check, Play, ChevronDown } from 'lucide-react';

interface RemediationAction {
  id: string;
  title: string;
  connector: string;
  status: string;
  steps: string[];
  result: Record<string, unknown> | null;
  vulnerabilityTitle: string | null;
  createdAt: string | null;
}

interface ConnectorDef {
  id: string;
  label: string;
  description: string;
  fields: Array<{ key: string; label: string; secret?: boolean; placeholder?: string }>;
}

const STATUS_STYLE: Record<string, string> = {
  proposed: 'text-chart-warning bg-chart-warning/10 border-chart-warning/20',
  approved: 'text-primary bg-primary/10 border-primary/20',
  executing: 'text-primary bg-primary/10 border-primary/20',
  verified: 'text-chartreuse bg-chartreuse/10 border-chartreuse/20',
  failed: 'text-destructive bg-destructive/10 border-destructive/20',
};

/**
 * RemediationPanel — proponer/aprobar/ejecutar remediaciones (C-2).
 * Los secretos del conector viajan cifrados; la UI nunca los re-muestra.
 */
export function RemediationPanel({
  projectId,
  prefill,
}: {
  projectId: string;
  prefill?: { title: string; steps: string[] } | null;
}) {
  const [actions, setActions] = useState<RemediationAction[]>([]);
  const [connectors, setConnectors] = useState<ConnectorDef[]>([]);
  const [connector, setConnector] = useState('');
  // El padre re-monta con key al elegir otro hallazgo: el inicial basta.
  const [title, setTitle] = useState(prefill?.title ?? '');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(!!prefill);

  const refresh = useCallback(() => {
    return fetch(`/api/remediation?projectId=${projectId}`)
      .then(async (res) => res.json().catch(() => ({})));
  }, [projectId]);

  const applyState = useCallback((data: {
    success?: boolean;
    actions?: RemediationAction[];
    connectors?: ConnectorDef[];
  }) => {
    if (!data.success) return;
    setActions(data.actions ?? []);
    if (Array.isArray(data.connectors) && data.connectors.length > 0) {
      setConnectors(data.connectors);
      setConnector((prev) => prev || data.connectors![0]!.id);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    refresh()
      .then((data) => {
        if (!cancelled) applyState(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refresh, applyState]);

  const reload = () => {
    refresh().then(applyState).catch(() => {});
  };

  const propose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connector || !title.trim()) return;
    setBusy('propose');
    setError('');
    try {
      const res = await fetch('/api/remediation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: title.trim(),
          connector,
          config: fields,
          steps: prefill?.steps ?? [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setTitle('');
        setFields({});
        reload();
      } else {
        setError(data.error || 'No se pudo proponer');
      }
    } catch {
      setError('No se pudo proponer');
    } finally {
      setBusy(null);
    }
  };

  const act = async (id: string, op: 'approve' | 'execute') => {
    setBusy(id + op);
    setError('');
    try {
      const res = await fetch('/api/remediation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, op, projectId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) reload();
      else setError(data.error || 'La operación falló');
    } catch {
      setError('La operación falló');
    } finally {
      setBusy(null);
    }
  };

  const activeConnector = connectors.find((c) => c.id === connector);

  return (
    <div className="rounded-2xl border border-border bg-card/50 p-6 space-y-5">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
        aria-expanded={open}
      >
        <span className="text-sm font-extrabold tracking-tight text-foreground flex items-center gap-2">
          <Wrench aria-hidden="true" className="w-4 h-4 text-primary" />
          Remediación: de recomendar a ejecutar ({actions.length})
        </span>
        <ChevronDown aria-hidden="true" className={`w-4 h-4 text-muted-fg transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <form onSubmit={propose} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: purgar caché tras deploy"
              maxLength={200}
              className="md:col-span-2 w-full bg-muted/40 border border-border focus:border-primary rounded-xl px-4 py-2.5 text-sm focus:outline-none"
            />
            <select
              value={connector}
              onChange={(e) => { setConnector(e.target.value); setFields({}); }}
              className="bg-muted/40 border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary cursor-pointer"
              aria-label="Conector"
            >
              {connectors.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy === 'propose' || !title.trim() || !connector}
              className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-2xs font-extrabold uppercase tracking-widest hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {busy === 'propose' ? 'Proponiendo…' : 'Proponer acción'}
            </button>
            {activeConnector && (
              <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeConnector.fields.map((f) => (
                  <input
                    key={f.key}
                    type={f.secret ? 'password' : 'text'}
                    value={fields[f.key] ?? ''}
                    onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={`${f.label}${f.placeholder ? ` (${f.placeholder})` : ''}`}
                    aria-label={f.label}
                    className="w-full bg-muted/40 border border-border focus:border-primary rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none"
                  />
                ))}
              </div>
            )}
          </form>
          {activeConnector && (
            <p className="text-2xs text-muted-fg -mt-2">{activeConnector.description}</p>
          )}
          {error && <p className="text-sm text-destructive font-bold">{error}</p>}

          <ul className="space-y-2">
            {actions.map((a) => (
              <li key={a.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 rounded-xl border border-border bg-muted/10">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{a.title}</p>
                  <p className="text-2xs text-muted-fg font-mono">{a.connector}</p>
                </div>
                <span className={`text-2xs font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider w-fit ${STATUS_STYLE[a.status] ?? ''}`}>
                  {a.status}
                </span>
                {a.status === 'proposed' && (
                  <button
                    onClick={() => act(a.id, 'approve')}
                    disabled={busy === a.id + 'approve'}
                    className="px-4 py-1.5 rounded-lg border border-primary/30 text-primary text-2xs font-extrabold uppercase tracking-widest hover:bg-primary/10 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Check aria-hidden="true" className="w-3 h-3 inline mr-1" /> Aprobar
                  </button>
                )}
                {a.status === 'approved' && (
                  <button
                    onClick={() => act(a.id, 'execute')}
                    disabled={busy === a.id + 'execute'}
                    className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-2xs font-extrabold uppercase tracking-widest hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Play aria-hidden="true" className="w-3 h-3 inline mr-1" /> Ejecutar
                  </button>
                )}
              </li>
            ))}
            {actions.length === 0 && (
              <p className="text-sm text-muted-fg">Sin acciones todavía. Propón la primera arriba.</p>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
