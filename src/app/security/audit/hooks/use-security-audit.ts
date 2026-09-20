'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { AuditLogEntry, ApiResponse, SiemAlertEntry, SiemAlertsApiResponse, Tab } from '../types';

interface AuditFilters {
  eventType: string;
  ip: string;
  from: string;
  to: string;
}

interface UseSecurityAuditReturn {
  // State
  tab: Tab;
  logs: AuditLogEntry[];
  total: number;
  eventTypes: string[];
  loading: boolean;
  error: string | null;
  unauthorized: boolean;
  expandedId: string | null;
  filters: AuditFilters;
  autoRefresh: boolean;
  // SIEM state
  siemAlerts: SiemAlertEntry[];
  siemBreakdown: { success: number; failed: number };
  // WHOIS state
  whoisAlerts: SiemAlertEntry[];
  // DNS state
  dnsAlerts: SiemAlertEntry[];
  // Actions
  setTab: (t: Tab) => void;
  setExpandedId: (id: string | null) => void;
  setFilters: (f: AuditFilters) => void;
  setAutoRefresh: (v: boolean) => void;
  handleFilterChange: (f: AuditFilters) => void;
  refresh: () => void;
}

export function useSecurityAudit(): UseSecurityAuditReturn {
  const [tab, setTab] = useState<Tab>('events');
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<AuditFilters>({ eventType: 'all', ip: '', from: '', to: '' });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SIEM state
  const [siemAlerts, setSiemAlerts] = useState<SiemAlertEntry[]>([]);
  const [siemBreakdown, setSiemBreakdown] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });
  // WHOIS state
  const [whoisAlerts, setWhoisAlerts] = useState<SiemAlertEntry[]>([]);
  // DNS state
  const [dnsAlerts, setDnsAlerts] = useState<SiemAlertEntry[]>([]);

  const fetchLogs = useCallback(async (f: AuditFilters, activeTab?: Tab) => {
    const t = activeTab ?? tab;
    setLoading(true);
    setError(null);
    setUnauthorized(false);
    try {
      if (t === 'siem') {
        const params = new URLSearchParams();
        if (f.ip) params.set('ip', f.ip);
        if (f.from) params.set('from', f.from);
        if (f.to) params.set('to', f.to);
        params.set('limit', '100');
        const res = await fetch(`/api/security/siem-alerts?${params}`);
        const data: SiemAlertsApiResponse = await res.json();
        if (!data.success) {
          if (res.status === 401) setUnauthorized(true);
          else setError(data.error || 'Error al cargar');
        } else {
          setSiemAlerts(data.alerts);
          setSiemBreakdown(data.breakdown);
        }
      } else if (t === 'whois') {
        const params = new URLSearchParams();
        params.set('ruleEventType', 'whois_change_detected');
        if (f.ip) params.set('ip', f.ip);
        if (f.from) params.set('from', f.from);
        if (f.to) params.set('to', f.to);
        params.set('limit', '100');
        const res = await fetch(`/api/security/siem-alerts?${params}`);
        const data: SiemAlertsApiResponse = await res.json();
        if (!data.success) {
          if (res.status === 401) setUnauthorized(true);
          else setError(data.error || 'Error al cargar');
        } else {
          setWhoisAlerts(data.alerts);
        }
      } else if (t === 'dns') {
        const params = new URLSearchParams();
        params.set('ruleEventType', 'dns_change_detected');
        if (f.ip) params.set('ip', f.ip);
        if (f.from) params.set('from', f.from);
        if (f.to) params.set('to', f.to);
        params.set('limit', '100');
        const res = await fetch(`/api/security/siem-alerts?${params}`);
        const data: SiemAlertsApiResponse = await res.json();
        if (!data.success) {
          if (res.status === 401) setUnauthorized(true);
          else setError(data.error || 'Error al cargar');
        } else {
          setDnsAlerts(data.alerts);
        }
      } else {
        const params = new URLSearchParams();
        if (f.eventType !== 'all') params.set('eventType', f.eventType);
        if (f.ip) params.set('ip', f.ip);
        if (f.from) params.set('from', f.from);
        if (f.to) params.set('to', f.to);
        params.set('limit', '100');
        const res = await fetch(`/api/security/audit-logs?${params}`);
        const data: ApiResponse = await res.json();
        if (!data.success) {
          if (res.status === 401) setUnauthorized(true);
          else setError(data.error || 'Error al cargar');
        } else {
          setLogs(data.logs);
          setTotal(data.total);
          if (data.eventTypes.length > 0) setEventTypes(data.eventTypes);
        }
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  const handleTabChange = useCallback((t: Tab) => {
    setTab(t);
    setExpandedId(null);
    fetchLogs(filters, t);
  }, [fetchLogs, filters]);

  // Initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { fetchLogs(filters, tab); }, []);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (!document.hidden) fetchLogs(filters, tab);
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, filters, tab, fetchLogs]);

  const handleFilterChange = useCallback((f: AuditFilters) => {
    setFilters(f);
    setExpandedId(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const isIpOnlyChange = f.ip !== filters.ip && f.eventType === filters.eventType && f.from === filters.from && f.to === filters.to;
    if (isIpOnlyChange && f.ip) {
      debounceRef.current = setTimeout(() => fetchLogs(f, tab), 300);
      return;
    }
    fetchLogs(f, tab);
  }, [fetchLogs, filters, tab]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  return {
    tab, logs, total, eventTypes, loading, error, unauthorized,
    expandedId, filters, autoRefresh,
    siemAlerts, siemBreakdown, whoisAlerts, dnsAlerts,
    setTab: handleTabChange,
    setExpandedId,
    setFilters,
    setAutoRefresh,
    handleFilterChange,
    refresh: () => fetchLogs(filters, tab),
  };
}
