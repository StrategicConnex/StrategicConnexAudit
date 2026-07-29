'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  History, Globe, BookMarked, AlertCircle, Loader2,
  ChevronDown, ChevronRight, Clock, TrendingDown,
  Server, Shield, Mail, Network, Filter, Search, X
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────

interface DnsSnapshotDisplay {
  recordType: string;
  query: string;
  value: string;
  ttl: number | null;
  snapshotDate?: string;
}

interface WhoisSnapshotDisplay {
  domain: string;
  registrar: string | null;
  createdDate: string | null;
  expiresDate: string | null;
  updatedDate: string | null;
  status: string[];
  nameservers: string[];
  abuseContact: string | null;
  registrantOrg: string | null;
  diffSummary?: string | null;
  snapshotDate?: string;
}

interface TimelineChange {
  type: 'added' | 'removed' | 'changed';
  recordType: string;
  query: string;
  previousValue: string | null;
  currentValue: string | null;
  detectedAt: string;
  source: 'dns';
}

interface WhoisTimelineChange {
  field: string;
  label: string;
  previousValue: string | null;
  currentValue: string | null;
  severity: 'info' | 'warning' | 'critical';
  detectedAt: string;
  source: 'whois';
}

interface HistoryResponse {
  success: boolean;
  type: string;
  projectId: string;
  dns: { snapshots: DnsSnapshotDisplay[]; totalCount: number; firstSeen: string | null; lastSeen: string | null; changeCount: number } | null;
  whois: { snapshots: WhoisSnapshotDisplay[]; totalCount: number; firstSeen: string | null; lastSeen: string | null; changeCount: number } | null;
  timeline: { dnsChanges: TimelineChange[]; whoisChanges: WhoisTimelineChange[]; totalChanges: number; fromDate: string; toDate: string } | null;
}

interface HistoryPanelProps {
  projectId: string;
  defaultQuery?: string;
  defaultTab?: 'dns' | 'whois' | 'timeline';
  onClose?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'text-destructive bg-destructive/10 border-destructive/20',
  warning: 'text-[oklch(75% 0.13 80)] bg-[oklch(75% 0.13 80)]/10 border-[oklch(75% 0.13 80)]/20',
  info: 'text-primary bg-primary/10 border-primary/20',
};

const RECORD_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  A: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  AAAA: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
  MX: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
  NS: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' },
  TXT: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  CNAME: { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/20' },
  SOA: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
};

function getRecordColor(type: string) {
  return RECORD_TYPE_COLORS[type.toUpperCase()] || { bg: 'bg-muted/10', text: 'text-muted-fg', border: 'border-border/50' };
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────

export function HistoryPanel({ projectId, defaultQuery, defaultTab, onClose }: HistoryPanelProps) {
  const [activeTab, setActiveTab] = useState<'dns' | 'whois' | 'timeline'>(defaultTab || 'dns');
  const [searchQuery, setSearchQuery] = useState(defaultQuery || '');
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleItem = (id: string) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const fetchHistory = useCallback(async (type: string, query?: string) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ projectId, type, limit: '30' });
      if (query) params.set('query', query);
      const res = await fetch(`/api/intelligence/history?${params}`);
      const json: HistoryResponse = await res.json();
      if (json.success) {
        setData(json);
      } else {
        setError('Error al cargar historial');
      }
    } catch (err: any) {
      setError(`Error de conexión: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchHistory(activeTab, activeTab === 'timeline' ? (searchQuery || defaultQuery) : (searchQuery || undefined));
  }, [activeTab, fetchHistory]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchHistory(activeTab, activeTab === 'timeline' ? (searchQuery || defaultQuery) : (searchQuery || undefined));
  };

  const dnsSnapshots = data?.dns?.snapshots || [];
  const whoisSnapshots = data?.whois?.snapshots || [];
  const dnsChangeCount = data?.dns?.changeCount || 0;
  const whoisChangeCount = data?.whois?.changeCount || 0;
  const totalDns = data?.dns?.totalCount || 0;
  const totalWhois = data?.whois?.totalCount || 0;
  const timeline = data?.timeline;
  const allChanges = [...(timeline?.dnsChanges || []), ...(timeline?.whoisChanges || [])];

  return (
    <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-400">
      {/* Header */}
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-extrabold text-foreground tracking-tight flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            Historial DNS / WHOIS
          </h3>
          <p className="text-[10px] text-muted-fg mt-0.5">
            Evolución histórica de registros DNS y datos WHOIS
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-muted-fg hover:text-foreground/80 transition-colors text-xs font-bold cursor-pointer">
            Cerrar x
          </button>
        )}
      </div>

      {/* Search & Filters */}
      <div className="p-4 border-b border-border bg-muted/[0.02]">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-fg" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={activeTab === 'timeline' ? 'Dominio para timeline...' : 'Filtrar por dominio o IP...'}
              className="w-full bg-muted/30 border border-border text-foreground text-xs rounded-lg py-2 pl-9 pr-8 outline-none focus:border-primary/40 transition-all"
            />
            {searchQuery && (
              <button type="button" onClick={() => { setSearchQuery(''); if (activeTab !== 'timeline') fetchHistory(activeTab); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-fg hover:text-foreground cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button type="submit" className="bg-muted/20 border border-border hover:bg-muted/40 text-xs font-bold px-3 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5">
            <Filter className="w-3 h-3" /> Buscar
          </button>
        </form>

        {/* Tabs */}
        <div className="flex gap-1.5 mt-3">
          <button
            onClick={() => setActiveTab('dns')}
            className={`flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
              activeTab === 'dns'
                ? 'bg-primary/15 border-primary/30 text-primary'
                : 'bg-muted/10 border-border text-muted-fg hover:text-foreground/80'
            }`}
          >
            <Network className="w-3 h-3" />
            DNS
            {dnsChangeCount > 0 && (
              <span className="text-[8px] bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.5 rounded-full font-bold">{dnsChangeCount}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('whois')}
            className={`flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
              activeTab === 'whois'
                ? 'bg-primary/15 border-primary/30 text-primary'
                : 'bg-muted/10 border-border text-muted-fg hover:text-foreground/80'
            }`}
          >
            <BookMarked className="w-3 h-3" />
            WHOIS
            {whoisChangeCount > 0 && (
              <span className="text-[8px] bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.5 rounded-full font-bold">{whoisChangeCount}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
              activeTab === 'timeline'
                ? 'bg-primary/15 border-primary/30 text-primary'
                : 'bg-muted/10 border-border text-muted-fg hover:text-foreground/80'
            }`}
          >
            <TrendingDown className="w-3 h-3" />
            Timeline
            {timeline && timeline.totalChanges > 0 && (
              <span className="text-[8px] text-[oklch(75% 0.13 80)] bg-[oklch(75% 0.13 80)]/10 border border-[oklch(75% 0.13 80)]/20 px-1.5 py-0.5 rounded-full font-bold">{timeline.totalChanges}</span>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-h-[500px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-xs text-muted-fg font-bold uppercase tracking-wider">Cargando historial...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-3" />
            <p className="text-xs text-destructive font-bold">{error}</p>
          </div>
        ) : activeTab === 'timeline' ? (
          /* ─── Timeline ─── */
          !timeline ? (
            <div className="p-8 text-center">
              <TrendingDown className="w-8 h-8 text-muted-fg mx-auto mb-3" />
              <p className="text-xs text-muted-fg">Ingresá un dominio y presioná Buscar para ver el timeline de cambios.</p>
            </div>
          ) : allChanges.length === 0 ? (
            <div className="p-8 text-center">
              <Shield className="w-8 h-8 text-chartreuse mx-auto mb-3" />
              <p className="text-xs text-chartreuse font-bold">Sin cambios detectados</p>
              <p className="text-[9px] text-muted-fg/60 mt-1">No hay variaciones entre el último snapshot y el anterior.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {allChanges.map((change: any, idx) => {
                const isDns = change.source === 'dns';
                const sev = isDns ? 'info' : (change.severity || 'info');
                const sevStyle = SEVERITY_STYLES[sev] || SEVERITY_STYLES.info;
                const colors = isDns ? getRecordColor(change.recordType) : null;
                return (
                  <div key={`tl-${idx}`} className="p-4 hover:bg-muted/5 transition-colors">
                    <div className="flex items-start gap-3">
                      {isDns ? (
                        <span className={`text-[8px] font-extrabold px-2 py-0.5 rounded border ${colors!.bg} ${colors!.text} ${colors!.border} uppercase shrink-0 mt-0.5`}>
                          {change.recordType}
                        </span>
                      ) : (
                        <span className={`text-[8px] font-extrabold px-2 py-0.5 rounded border ${sevStyle} uppercase shrink-0 mt-0.5 flex items-center gap-1`}>
                          {getSeverityIcon(change.severity || 'info')} {change.label || 'WHOIS'}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[9px] font-bold text-foreground/80">{change.query || change.domain || searchQuery}</span>
                          <span className="text-[8px] text-muted-fg">{change.detectedAt ? fmtDate(change.detectedAt) : ''}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px] font-mono">
                          {change.previousValue !== null ? (
                            <span className="text-destructive/70 line-through truncate max-w-[140px]">{change.previousValue}</span>
                          ) : (
                            <span className="text-muted-fg italic">(nuevo)</span>
                          )}
                          <TrendingDown className="w-2.5 h-2.5 text-muted-fg shrink-0" />
                          <span className="text-chartreuse/80 truncate max-w-[140px]">{change.currentValue}</span>
                        </div>
                      </div>
                      <span className={`text-[7px] font-bold uppercase tracking-widest shrink-0 ${sevStyle}`}>
                        {isDns ? (change.type || 'changed') : sev}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div className="p-3 text-center text-[8px] text-muted-fg border-t border-white/[0.04]">
                {timeline.totalChanges} cambios entre {fmtDate(timeline.fromDate)} y {fmtDate(timeline.toDate)}
              </div>
            </div>
          )
        ) : activeTab === 'dns' ? (
          /* ─── DNS History ─── */
          dnsSnapshots.length === 0 ? (
            <div className="p-8 text-center">
              <Globe className="w-8 h-8 text-muted-fg mx-auto mb-3" />
              <p className="text-xs text-muted-fg">No hay registros DNS histricos para este proyecto.</p>
              <p className="text-[9px] text-muted-fg/60 mt-1">Los datos se generan automáticamente al escanear un dominio.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {dnsSnapshots.map((snap, idx) => {
                const colors = getRecordColor(snap.recordType);
                const itemKey = `dns-${idx}`;
                const isExpanded = expandedItems[itemKey] || false;
                return (
                  <div key={itemKey}>
                    <button
                      onClick={() => toggleItem(itemKey)}
                      className="w-full flex items-center justify-between p-4 hover:bg-muted/5 transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`text-[8px] font-extrabold px-2 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border} uppercase shrink-0`}>
                          {snap.recordType}
                        </span>
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-foreground truncate block max-w-[280px]">{snap.query}</span>
                          <span className="text-[9px] text-muted-fg font-mono truncate block max-w-[280px]">{snap.value}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[8px] text-muted-fg">{snap.snapshotDate ? fmtDate(snap.snapshotDate) : ''}</span>
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-fg" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-fg" />}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-0 bg-muted/[0.02] border-t border-white/[0.03] animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="grid grid-cols-2 gap-3 pt-3">
                          <div className="bg-muted/5 border border-border/50 rounded-lg p-3">
                            <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block mb-1">Valor</span>
                            <code className="text-[10px] text-foreground/80 font-mono break-all">{snap.value}</code>
                          </div>
                          <div className="bg-muted/5 border border-border/50 rounded-lg p-3">
                            <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block mb-1">TTL</span>
                            <span className="text-[10px] text-foreground/80 font-bold">{snap.ttl !== null ? `${snap.ttl}s` : 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {totalDns > 30 && (
                <div className="p-4 text-center text-[9px] text-muted-fg border-t border-white/[0.04]">
                  Mostrando 30 de {totalDns} registros. Usá el filtro para acotar.
                </div>
              )}
            </div>
          )
        ) : (
          /* ─── WHOIS History ─── */
          whoisSnapshots.length === 0 ? (
            <div className="p-8 text-center">
              <BookMarked className="w-8 h-8 text-muted-fg mx-auto mb-3" />
              <p className="text-xs text-muted-fg">No hay snapshots WHOIS históricos para este proyecto.</p>
              <p className="text-[9px] text-muted-fg/60 mt-1">Los datos se generan al escanear un dominio con whois.full.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {whoisSnapshots.map((snap, idx) => {
                const itemKey = `whois-${idx}`;
                const isExpanded = expandedItems[itemKey] || false;
                const daysRemaining = snap.expiresDate
                  ? Math.round((new Date(snap.expiresDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  : null;

                return (
                  <div key={itemKey}>
                    <button
                      onClick={() => toggleItem(itemKey)}
                      className="w-full flex items-center justify-between p-4 hover:bg-muted/5 transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Server className="w-4 h-4 text-muted-fg shrink-0" />
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-foreground truncate block max-w-[200px]">{snap.domain}</span>
                          <span className="text-[9px] text-muted-fg truncate block max-w-[200px]">{snap.registrar || 'Registrador desconocido'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {daysRemaining !== null && daysRemaining <= 30 && (
                          <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-full border ${
                            daysRemaining <= 0 ? SEVERITY_STYLES.critical : SEVERITY_STYLES.warning
                          }`}>
                            {daysRemaining <= 0 ? 'EXPIRADO' : `${daysRemaining}d`}
                          </span>
                        )}
                        {snap.diffSummary && (
                          <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded-full border text-[oklch(75% 0.13 80)] bg-[oklch(75% 0.13 80)]/10 border-[oklch(75% 0.13 80)]/20">
                            CAMBIO
                          </span>
                        )}
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-fg" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-fg" />}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-0 bg-muted/[0.02] border-t border-white/[0.03] animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="grid grid-cols-2 gap-3 pt-3">
                          <div className="bg-muted/5 border border-border/50 rounded-lg p-3">
                            <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block mb-1">Registrador</span>
                            <span className="text-[10px] text-foreground/80 font-medium break-all">{snap.registrar || '/'}</span>
                          </div>
                          <div className="bg-muted/5 border border-border/50 rounded-lg p-3">
                            <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block mb-1">Organización</span>
                            <span className="text-[10px] text-foreground/80 font-medium break-all">{snap.registrantOrg || '/'}</span>
                          </div>
                          <div className="bg-muted/5 border border-border/50 rounded-lg p-3">
                            <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block mb-1">Creación</span>
                            <span className="text-[10px] text-foreground/80 font-medium">{fmtDate(snap.createdDate)}</span>
                          </div>
                          <div className="bg-muted/5 border border-border/50 rounded-lg p-3">
                            <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block mb-1">Expiración</span>
                            <span className={`text-[10px] font-medium ${daysRemaining !== null && daysRemaining <= 0 ? 'text-destructive' : daysRemaining !== null && daysRemaining < 30 ? 'text-[oklch(75% 0.13 80)]' : 'text-foreground/80'}`}>
                              {fmtDate(snap.expiresDate)}
                              {daysRemaining !== null && daysRemaining > 0 && daysRemaining <= 30 && ` (${daysRemaining}d)`}
                            </span>
                          </div>
                          <div className="bg-muted/5 border border-border/50 rounded-lg p-3 col-span-2">
                            <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block mb-1">Nameservers</span>
                            <div className="flex flex-wrap gap-1">
                              {snap.nameservers.length > 0 ? snap.nameservers.map((ns, ni) => (
                                <code key={ni} className="text-[9px] text-foreground/70 font-mono bg-muted/10 border border-border/30 px-1.5 py-0.5 rounded">{ns}</code>
                              )) : <span className="text-[10px] text-muted-fg italic">Sin nameservers</span>}
                            </div>
                          </div>
                        </div>

                        {snap.diffSummary && (
                          <div className="mt-3 p-3 rounded-xl bg-[oklch(75% 0.13 80)]/[0.03] border border-[oklch(75% 0.13 80)]/15">
                            <div className="flex items-center gap-1.5 mb-2">
                              <TrendingDown className="w-3 h-3 text-[oklch(75% 0.13 80)]" />
                              <span className="text-[8px] font-bold text-[oklch(75% 0.13 80)] uppercase tracking-widest">Cambios Detectados</span>
                            </div>
                            <p className="text-[10px] text-foreground/70 leading-relaxed">{snap.diffSummary}</p>
                          </div>
                        )}

                        {snap.abuseContact && (
                          <div className="mt-3 flex items-center gap-2">
                            <Mail className="w-3 h-3 text-muted-fg" />
                            <span className="text-[9px] text-muted-fg">Abuso: {snap.abuseContact}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {totalWhois > 30 && (
                <div className="p-4 text-center text-[9px] text-muted-fg border-t border-white/[0.04]">
                  Mostrando 30 de {totalWhois} snapshots. Usá el filtro para acotar.
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* Footer stats */}
      {data && (
        <div className="p-3 border-t border-border bg-muted/[0.02] flex items-center justify-between text-[8px] text-muted-fg uppercase tracking-widest font-bold">
          <span className="flex items-center gap-1.5">
            <Clock className="w-2.5 h-2.5" /> 
            Último: {data.dns?.lastSeen || data.whois?.lastSeen ? fmtDate(data.dns?.lastSeen || data.whois?.lastSeen) : 'N/A'}
          </span>
          <span className="flex items-center gap-1.5">
            <Globe className="w-2.5 h-2.5" /> {dnsSnapshots.length + whoisSnapshots.length} registros
          </span>
        </div>
      )}
    </div>
  );
}

/** Helper: severity icon for timeline changes */
function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'critical': return <AlertCircle className="w-2.5 h-2.5" />;
    case 'warning': return <TrendingDown className="w-2.5 h-2.5" />;
    default: return <Shield className="w-2.5 h-2.5" />;
  }
}
