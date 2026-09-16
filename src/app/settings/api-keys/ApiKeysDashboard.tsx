'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Key, Plus, Trash2, Copy, Check, Loader2, AlertTriangle,
  ShieldCheck, Search, ArrowUpDown, Clock, ExternalLink,
  BarChart3, Activity, RefreshCw, TrendingUp, LockKeyhole,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scope: string[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

interface KeyUsage {
  totalRequests: number;
  todayRequests: number;
  thisWeekRequests: number;
  thisMonthRequests: number;
  lastUsedAt: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null;
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86400000);
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) return '—';
  return new Date(isoDate).toLocaleDateString('es-AR', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatDateTime(isoDate: string | null): string {
  if (!isoDate) return '—';
  return new Date(isoDate).toLocaleDateString('es-AR', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function miniBar(count: number, max: number, total: boolean): React.ReactNode {
  if (max === 0) return null;
  const pct = Math.min((count / max) * 100, 100);
  return (
    <div className="w-16 h-1.5 bg-muted/20 rounded-full overflow-hidden shrink-0">
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          total ? 'bg-primary' : 'bg-chartreuse'
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, accent, sub }: {
  icon: React.ReactNode; label: string; value: string | number; accent: string; sub?: string;
}) {
  return (
    <div className="bg-muted/5 border border-border rounded-2xl p-5 flex items-start gap-4 hover:bg-muted/10 transition-all group">
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xs font-bold text-muted-fg uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-extrabold tracking-tight text-foreground mt-0.5">{value}</p>
        {sub && <p className="text-2xs text-muted-fg mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ApiKeysDashboard() {
  // ── State ─────────────────────────────────────────────────────
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [usageMap, setUsageMap] = useState<Record<string, KeyUsage>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  // Create form
  const [newKeyName, setNewKeyName] = useState('');
  const [expiresDays, setExpiresDays] = useState(0);
  const [creating, setCreating] = useState(false);

  // Reveal modal
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [expiringSoon, setExpiringSoon] = useState(false);
  const [sortNewest, setSortNewest] = useState(true);

  // Copy
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ── Fetch keys + usage ────────────────────────────────────────
  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnauthorized(false);
    try {
      const res = await fetch('/api/api-keys');
      // Sin sesión no hay llaves que mostrar: candado honesto, no error crudo.
      if (res.status === 401) {
        setUnauthorized(true);
        return;
      }
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Error al obtener llaves');
        return;
      }
      const keys: ApiKey[] = data.keys || [];
      setApiKeys(keys);

      // Fetch usage for every key in parallel
      const usageResults = await Promise.allSettled(
        keys.map(async (k) => {
          const uRes = await fetch(`/api/api-keys/${k.id}/usage`);
          if (!uRes.ok) return null;
          const uData = await uRes.json();
          if (!uData.success) return null;
          return { keyId: k.id, usage: uData as KeyUsage };
        }),
      );

      const nextUsage: Record<string, KeyUsage> = {};
      for (const r of usageResults) {
        if (r.status === 'fulfilled' && r.value) {
          nextUsage[r.value.keyId] = r.value.usage;
        }
      }
      setUsageMap(nextUsage);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  // ── Create ─────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName.trim(),
          scope: [],
          expiresAt: expiresDays > 0
            ? new Date(Date.now() + expiresDays * 86400000).toISOString()
            : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRevealedKey(data.rawKey);
        setShowModal(true);
        setNewKeyName('');
        setExpiresDays(0);
        fetchKeys();
      } else if (res.status === 401) {
        setUnauthorized(true);
      } else {
        setError(data.error || 'Error al crear llave');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setCreating(false);
    }
  };

  // ── Revoke ─────────────────────────────────────────────────────
  const handleRevoke = async (id: string) => {
    if (!confirm('¿Revocar esta API Key? Los servicios que la usen perderán acceso inmediatamente.')) return;
    try {
      const res = await fetch(`/api/api-keys?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) fetchKeys();
      else if (res.status === 401) setUnauthorized(true);
      else setError(`Error: ${data.error}`);
    } catch (err: unknown) {
      setError(`Error de red: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ── Copy ───────────────────────────────────────────────────────
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Derived data ───────────────────────────────────────────────
  const activeKeys = apiKeys.filter(k => !k.expiresAt || new Date(k.expiresAt) > new Date());
  const expiringSoonKeys = apiKeys.filter(k => {
    const d = daysUntil(k.expiresAt);
    return d !== null && d >= 0 && d <= 7;
  });

  // Real usage-derived stats (from securityAuditLogs)
  const totalThisWeek = Object.values(usageMap).reduce((sum, u) => sum + (u.thisWeekRequests || 0), 0);
  const totalRequests = Object.values(usageMap).reduce((sum, u) => sum + (u.totalRequests || 0), 0);
  const keysUsedThisWeek = Object.values(usageMap).filter(u => (u.thisWeekRequests || 0) > 0).length;

  const visibleKeys = apiKeys
    .filter(k => {
      if (search.trim() && !k.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (expiringSoon) {
        const d = daysUntil(k.expiresAt);
        if (d === null || d > 7 || d < 0) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aT = new Date(a.createdAt).getTime();
      const bT = new Date(b.createdAt).getTime();
      return sortNewest ? bT - aT : aT - bT;
    });

  const maxTotal = Math.max(1, ...visibleKeys.map(k => usageMap[k.id]?.totalRequests || 0));
  const maxWeek = Math.max(1, ...visibleKeys.map(k => usageMap[k.id]?.thisWeekRequests || 0));

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto space-y-10">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Key className="w-5.5 h-5.5 text-primary" />
          </div>
          API Keys
        </h1>
        <p className="text-sm text-muted-fg mt-2">
          Gestiona las claves de acceso programático para la REST API de SCAUDIT. Los datos de uso provienen de <code className="text-chartreuse text-2xs">security_audit_logs</code> — los conteos reflejan llamadas reales autenticadas con cada clave.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Key className="w-5 h-5 text-primary" />}
          label="Claves activas"
          value={activeKeys.length}
          accent="bg-primary/10 border-primary/20 text-primary"
        />
        <StatCard
          icon={<Activity className="w-5 h-5 text-chartreuse" />}
          label="Usadas esta semana"
          value={keysUsedThisWeek}
          sub={`${formatCount(totalThisWeek)} solicitudes totales`}
          accent="bg-chartreuse/10 border-chartreuse/20 text-chartreuse"
        />
        <StatCard
          icon={<BarChart3 className="w-5 h-5 text-sky-400" />}
          label="Solicitudes totales"
          value={formatCount(totalRequests)}
          accent="bg-sky-500/10 border-sky-500/20 text-sky-400"
        />
        <StatCard
          icon={<Clock className="w-5 h-5 text-amber-400" />}
          label="Por vencer"
          value={expiringSoonKeys.length}
          accent="bg-amber-500/10 border-amber-500/20 text-amber-400"
        />
      </div>

      {/* Create Form */}
      <form onSubmit={handleCreate} className="bg-muted/5 border border-border rounded-2xl p-8 space-y-6">
        <h3 className="text-xs font-bold text-muted-fg uppercase tracking-widest flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary" /> Crear nueva API Key
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          <div className="space-y-2 md:col-span-2">
            <label className="text-2xs font-bold text-muted-fg uppercase tracking-widest">Nombre</label>
            <input
              type="text" required placeholder="p. ej. Pipeline CI/CD…"
              value={newKeyName} onChange={e => setNewKeyName(e.target.value)}
              className="w-full bg-card border border-border focus:border-primary rounded-xl px-5 py-3 text-sm font-bold focus:outline-none transition-all placeholder-zinc-600"
            />
          </div>
          <div className="space-y-2">
            <label className="text-2xs font-bold text-muted-fg uppercase tracking-widest">Vencimiento</label>
            <select
              value={expiresDays} onChange={e => setExpiresDays(Number(e.target.value))}
              className="w-full bg-card border border-border focus:border-primary rounded-xl px-5 py-3 text-sm font-bold focus:outline-none"
            >
              <option value={0}>Nunca</option>
              <option value={30}>30 días</option>
              <option value={90}>90 días</option>
              <option value={365}>365 días</option>
            </select>
          </div>
        </div>
        {unauthorized ? (
          <div className="border border-border text-muted-fg p-6 rounded-xl flex flex-col items-center text-center gap-2">
            <LockKeyhole aria-hidden="true" className="w-5 h-5" />
            <p className="text-sm font-bold text-foreground">Tus API keys viven tras tu sesión</p>
            <p className="text-xs max-w-sm">Inicia sesión para crear, ver y revocar claves de acceso programático.</p>
            <Link
              href="/login"
              className="mt-2 text-2xs font-bold uppercase tracking-widest text-primary transition-colors inline-flex items-center gap-1.5 px-4 py-2 rounded-md border"
              style={{ background: 'oklch(68% 0.14 230 / 0.08)', borderColor: 'oklch(68% 0.14 230 / 0.15)' }}
            >
              Iniciar sesión
            </Link>
          </div>
        ) : error ? (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs p-4 rounded-xl flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        <div className="flex justify-end">
          <button
            type="submit" disabled={creating || !newKeyName.trim()}
            className="bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl text-2xs font-extrabold uppercase tracking-widest shadow-[0_0_20px_rgba(99,102,241,0.2)] transition-all flex items-center gap-2 cursor-pointer"
          >
            {creating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generando…</>
            ) : (
              <><Plus className="w-4 h-4" /> Generar clave</>
            )}
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h3 className="text-xs font-bold text-muted-fg uppercase tracking-widest flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-chartreuse" />
            Keys ({apiKeys.length})
          </h3>
          <div className="flex items-center gap-3">
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-fg" />
              <input
                type="text" placeholder="Buscar por nombre…"
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full bg-card border border-border focus:border-primary rounded-xl pl-10 pr-4 py-2.5 text-xs font-medium focus:outline-none placeholder-zinc-600"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={expiringSoon}
                onChange={e => setExpiringSoon(e.target.checked)}
                className="rounded border-zinc-700 text-primary focus:ring-primary/20 bg-black" />
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-2xs font-bold text-muted-fg uppercase tracking-wider">Por vencer</span>
            </label>
            <button
              onClick={() => setSortNewest(!sortNewest)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-2xs font-bold uppercase tracking-wider border border-border text-muted-fg hover:text-primary hover:border-primary/30 bg-card transition-all cursor-pointer"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              {sortNewest ? 'Recientes' : 'Antiguas'}
            </button>
            <button onClick={fetchKeys}
              aria-label="Actualizar claves"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-2xs font-bold uppercase tracking-wider border border-border text-muted-fg hover:text-primary hover:border-primary/30 bg-card transition-all cursor-pointer"
              title="Actualizar"
            >
              <RefreshCw aria-hidden="true" className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : visibleKeys.length === 0 ? (
          <div className="text-center py-20 bg-muted/5 border border-dashed border-border rounded-2xl">
            <Key className="w-10 h-10 text-muted-fg mx-auto mb-3" />
            <p className="text-sm text-muted-fg">
              {search || expiringSoon ? 'Ninguna clave coincide con los filtros.' : 'Aún no hay API Keys. Crea una arriba.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-border rounded-2xl bg-muted/5">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/10 text-muted-fg font-bold">
                  <th className="p-4 uppercase tracking-wider text-2xs">Nombre</th>
                  <th className="p-4 uppercase tracking-wider text-2xs">Prefijo</th>
                  <th className="p-4 uppercase tracking-wider text-2xs">Creada</th>
                  <th className="p-4 uppercase tracking-wider text-2xs">Último uso</th>
                  <th className="p-4 uppercase tracking-wider text-2xs">Solicitudes</th>
                  <th className="p-4 uppercase tracking-wider text-2xs">Vence</th>
                  <th className="p-4 text-right uppercase tracking-wider text-2xs">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {visibleKeys.map(key => {
                  const days = daysUntil(key.expiresAt);
                  const isExpired = days !== null && days < 0;
                  const isExpiring = days !== null && days >= 0 && days <= 7;
                  const usage = usageMap[key.id];
                  const totalReq = usage?.totalRequests ?? 0;
                  const weekReq = usage?.thisWeekRequests ?? 0;
                  return (
                    <tr key={key.id} className="hover:bg-muted/5 transition-colors text-foreground/80 font-medium">
                      <td className="p-4 text-white font-bold flex items-center gap-2">
                        {key.name}
                        {isExpiring && (
                          <span className="text-2xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full font-bold">
                            {days}d
                          </span>
                        )}
                        {isExpired && (
                          <span className="text-2xs bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.5 rounded-full font-bold">
                            Vencida
                          </span>
                        )}
                      </td>
                      <td className="p-4 font-mono tracking-wider text-primary">{key.keyPrefix}…</td>
                      <td className="p-4 text-muted-fg">{formatDate(key.createdAt)}</td>
                      <td className="p-4">
                        {key.lastUsedAt ? (
                          <span className="text-chartreuse text-2xs">{formatDateTime(key.lastUsedAt)}</span>
                        ) : (
                          <span className="text-muted-fg italic text-2xs">Nunca usada</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="text-right min-w-[3ch]">
                            <span className="text-white font-bold text-2xs">{formatCount(totalReq)}</span>
                            {weekReq > 0 && (
                              <span className="text-chartreuse text-2xs ml-1">(+{formatCount(weekReq)}w)</span>
                            )}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            {miniBar(totalReq, maxTotal, true)}
                            {weekReq > 0 && miniBar(weekReq, maxWeek, false)}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        {key.expiresAt ? (
                          <span className={isExpired ? 'text-destructive' : 'text-muted-fg'}>
                            {formatDate(key.expiresAt)}
                          </span>
                        ) : (
                          <span className="text-muted-fg italic">Nunca</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleCopy(key.keyPrefix, 'cp-' + key.id)}
                            aria-label="Copiar prefijo de la clave"
                            className="text-muted-fg hover:text-primary bg-muted/10 hover:bg-primary/10 p-2 rounded-lg border border-border hover:border-primary/30 transition-all cursor-pointer"
                            title="Copiar prefijo"
                          >
                            {copiedId === 'cp-' + key.id
                              ? <Check aria-hidden="true" className="w-3.5 h-3.5 text-chartreuse" />
                              : <Copy aria-hidden="true" className="w-3.5 h-3.5" />
                            }
                          </button>
                          <button
                            onClick={() => handleRevoke(key.id)}
                            aria-label="Revocar esta API key"
                            className="text-destructive hover:text-red-300 bg-destructive/10 hover:bg-red-500/20 p-2 rounded-lg border border-destructive/20 transition-all cursor-pointer"
                            title="Revocar esta clave"
                          >
                            <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: key revealed once */}
      {showModal && revealedKey && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-card border border-border w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl p-8 relative space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-primary/15 border border-primary/30 rounded-full flex items-center justify-center mx-auto text-primary">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">API Key creada</h3>
              <p className="text-xs text-muted-fg leading-relaxed">
                Esta clave no se volverá a mostrar. Guárdala en un lugar seguro ahora.
              </p>
            </div>
            <div className="bg-black border border-border rounded-xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest">Clave secreta</span>
                <button
                  onClick={() => handleCopy(revealedKey, 'modal-key')}
                  className="text-primary hover:text-primary/80 text-2xs font-bold uppercase flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedId === 'modal-key' ? (
                    <><Check className="w-3.5 h-3.5 text-chartreuse" /> ¡Copiada!</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5" /> Copiar</>
                  )}
                </button>
              </div>
              <div className="font-mono text-sm text-primary break-all bg-card p-4 border border-border/50 rounded-lg text-center tracking-wide select-all">
                {revealedKey}
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => { setShowModal(false); setRevealedKey(null); }}
                className="bg-zinc-100 hover:bg-white text-black font-extrabold text-2xs uppercase tracking-widest px-8 py-3.5 rounded-xl transition-all cursor-pointer"
              >
                Ya guardé la clave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Reference link */}
      <div className="text-center border-t border-border pt-6">
        <Link href="/docs/api" className="inline-flex items-center gap-1.5 text-2xs text-muted-fg hover:text-primary transition-colors">
          <ExternalLink className="w-3.5 h-3.5" />
          Ver la documentación de la API para detalles de autenticación
        </Link>
      </div>
    </div>
  );
}
