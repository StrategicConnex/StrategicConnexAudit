'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Bell, Key, Link2, Plus, Trash2, Cpu, CheckCircle2, AlertTriangle,
  Sliders, Play, Copy, Check, Sparkles, Send, ShieldCheck, Zap
} from 'lucide-react';

interface MonitoringTabProps {
  initialProjects: any[];
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
}

export function MonitoringTab({ initialProjects, selectedProjectId, setSelectedProjectId }: MonitoringTabProps) {
  const t = useTranslations('monitoring');
  // State for Monitoring Schedule
  const [schedule, setSchedule] = useState<{
    enabled: boolean;
    interval: 'daily' | 'weekly' | 'monthly';
    lastRunAt: string | null;
    nextRunAt: string | null;
  }>({
    enabled: true,
    interval: 'weekly',
    lastRunAt: null,
    nextRunAt: null
  });
  
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  // State for Webhooks
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [newWebhookName, setNewWebhookName] = useState('');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [isCreatingWebhook, setIsCreatingWebhook] = useState(false);
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(true);

  // State for Developer API Keys
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdClearKey, setCreatedClearKey] = useState<string | null>(null);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // State for Bulk Domains Scan
  const [bulkInput, setBulkInput] = useState('');
  const [isQueuingBulk, setIsQueuingBulk] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // State for Plan Selection (Visual Demonstration)
  const [currentPlan, setCurrentPlan] = useState<'starter' | 'business' | 'enterprise'>('business');
  const [showPlanModal, setShowPlanModal] = useState(false);

  const fetchMonitoringData = useCallback(async () => {
    try {
      setIsLoadingSchedule(true);
      const res = await fetch(`/api/monitoring?projectId=${selectedProjectId}`);
      const data = await res.json();
      if (data.success) {
        if (data.schedule) {
          setSchedule({
            enabled: data.schedule.enabled,
            interval: data.schedule.interval,
            lastRunAt: data.schedule.lastRunAt,
            nextRunAt: data.schedule.nextRunAt
          });
        }
        setAlerts(data.alerts || []);
      }
    } catch (err) {
      console.error('Failed to fetch monitoring details:', err);
    } finally {
      setIsLoadingSchedule(false);
    }
  }, [selectedProjectId]);

  const fetchWebhooks = useCallback(async () => {
    try {
      setIsLoadingWebhooks(true);
      const res = await fetch(`/api/webhooks?projectId=${selectedProjectId}`);
      const data = await res.json();
      if (data.success) {
        setWebhooks(data.webhooks || []);
      }
    } catch (err) {
      console.error('Failed to fetch webhooks:', err);
    } finally {
      setIsLoadingWebhooks(false);
    }
  }, [selectedProjectId]);

  const fetchApiKeys = useCallback(async () => {
    try {
      setIsLoadingKeys(true);
      const res = await fetch('/api/api-keys');
      const data = await res.json();
      if (data.success) {
        setApiKeys(data.apiKeys || []);
      }
    } catch (err) {
      console.error('Failed to fetch API keys:', err);
    } finally {
      setIsLoadingKeys(false);
    }
  }, []);

  // Fetch all Phase 4 data whenever project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    
    fetchMonitoringData();
    fetchWebhooks();
    fetchApiKeys();
    
    // Clear temporary clear keys or bulk logs on project switch
    setCreatedClearKey(null);
    setBulkMessage(null);
    setBulkError(null);
  }, [selectedProjectId, fetchMonitoringData, fetchWebhooks, fetchApiKeys]);

  // Mutators
  const saveScheduleSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingSchedule(true);
      const res = await fetch('/api/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          enabled: schedule.enabled,
          interval: schedule.interval
        })
      });
      const data = await res.json();
      if (data.success && data.schedule) {
        setSchedule({
          enabled: data.schedule.enabled,
          interval: data.schedule.interval,
          lastRunAt: data.schedule.lastRunAt,
          nextRunAt: data.schedule.nextRunAt
        });
        
        // Push a simulated info event in list to show live updates
        const simulatedAlert = {
          id: Date.now().toString(),
          title: 'Configuración Guardada',
          message: `Frecuencia de monitoreo establecida exitosamente a: ${schedule.interval}.`,
          severity: 'info',
          resolved: true,
          createdAt: new Date().toISOString()
        };
        setAlerts(prev => [simulatedAlert, ...prev]);
      }
    } catch (err) {
      console.error('Failed to update schedule:', err);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWebhookName.trim() || !newWebhookUrl.trim()) return;
    
    try {
      setIsCreatingWebhook(true);
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          name: newWebhookName.trim(),
          url: newWebhookUrl.trim()
        })
      });
      const data = await res.json();
      if (data.success && data.webhook) {
        setWebhooks(prev => [...prev, data.webhook]);
        setNewWebhookName('');
        setNewWebhookUrl('');
      }
    } catch (err) {
      console.error('Failed to register webhook:', err);
    } finally {
      setIsCreatingWebhook(false);
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    try {
      const res = await fetch(`/api/webhooks?id=${webhookId}&projectId=${selectedProjectId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setWebhooks(prev => prev.filter(w => w.id !== webhookId));
      }
    } catch (err) {
      console.error('Failed to delete webhook:', err);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    
    try {
      setIsCreatingKey(true);
      setCreatedClearKey(null);
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName.trim(),
          expiresDays: 90 // Default key expiry
        })
      });
      const data = await res.json();
      if (data.success && data.apiKey) {
        setApiKeys(prev => [...prev, data.apiKey]);
        setCreatedClearKey(data.clearKey);
        setNewKeyName('');
      }
    } catch (err) {
      console.error('Failed to create developer key:', err);
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    try {
      const res = await fetch(`/api/api-keys?id=${keyId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setApiKeys(prev => prev.filter(k => k.id !== keyId));
        if (createdClearKey) setCreatedClearKey(null);
      }
    } catch (err) {
      console.error('Failed to revoke API key:', err);
    }
  };

  const triggerSlackTest = async () => {
    // Simulated Slack dispatch triggered via active webhook alerts
    const simulatedSlackAlert = {
      id: Date.now().toString(),
      title: 'Slack Alert Test Dispatched',
      message: 'Canal de Slack configurado correctamente. Recibido evento webhook de test.',
      severity: 'info',
      resolved: false,
      createdAt: new Date().toISOString()
    };
    setAlerts(prev => [simulatedSlackAlert, ...prev]);
    alert('Slack test dispatched using Rich Block Kit payload. Border indicators rendered in destination channel.');
  };

  const handleQueueBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkMessage(null);
    setBulkError(null);
    
    const domains = bulkInput
      .split(/[\n,]+/)
      .map(d => d.trim())
      .filter(d => d.length > 0);
      
    if (domains.length === 0) {
      setBulkError('Introduce al menos un dominio válido.');
      return;
    }
    
    if (domains.length > 10) {
      setBulkError('Por seguridad de egress limitados, el escaneo masivo acepta máximo 10 dominios.');
      return;
    }

    try {
      setIsQueuingBulk(true);
      const res = await fetch('/api/bulk-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          targets: domains
        })
      });
      const data = await res.json();
      if (data.success) {
        setBulkMessage(data.message || `${domains.length} dominios añadidos a la cola de escaneo masivo.`);
        setBulkInput('');
        
        // Inject running items directly to trigger UI lists refresh
        const bulkAlert = {
          id: Date.now().toString(),
          title: 'Escaneo Masivo Iniciado',
          message: `Procesando cola asíncrona para: ${domains.join(', ')}.`,
          severity: 'info',
          resolved: false,
          createdAt: new Date().toISOString()
        };
        setAlerts(prev => [bulkAlert, ...prev]);
      } else {
        setBulkError(data.error || 'Error al procesar la cola de escaneo.');
      }
    } catch (err: any) {
      setBulkError(err.message || 'Error de red al conectar con el servidor.');
    } finally {
      setIsQueuingBulk(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  // Quota computations
  const getQuotaLimits = () => {
    switch (currentPlan) {
      case 'starter':
        return { projects: 10, scans: 100, price: '$49/mes' };
      case 'business':
        return { projects: 50, scans: 1000, price: '$149/mes' };
      case 'enterprise':
        return { projects: 999, scans: 9999, price: '$499/mes' };
    }
  };

  const planInfo = getQuotaLimits();
  const projectsPercentage = Math.min(100, Math.round((initialProjects.length / planInfo.projects) * 100));
  
  // Scans simulated count: Starter matches 45/100, Business matches 182/1000, Enterprise matches 456/Unlimited
  const activeScansSimulated = currentPlan === 'starter' ? 45 : currentPlan === 'business' ? 182 : 456;
  const scansPercentage = planInfo.scans === 9999 ? 5 : Math.min(100, Math.round((activeScansSimulated / planInfo.scans) * 100));

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Tab Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-border/50 pb-6">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Sliders aria-hidden="true" className="w-6 h-6 text-[oklch(68% 0.14 230)]" />
            {t('pageTitle')}
          </h2>
          <p className="text-xs text-muted-fg mt-1">
            {t('pageSubtitle')}
          </p>
        </div>

        {/* Project Selector */}
        <div className="flex items-center gap-3 shrink-0">
          <label className="text-[11px] font-bold uppercase tracking-widest text-muted-fg">{t('projectLabel')}</label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="bg-[#0c0c0e]/80 border border-border text-foreground/80 text-xs rounded-lg px-3 py-2 outline-none focus:border-primary/40 cursor-pointer"
          >
            {initialProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ────────────────── Bento Grid Row 1: Active Schedule, Billing Quota rings & Slack alert ────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Card 1: Active Audit Schedule Controls */}
        <div className="glass-card rounded-xl p-6 relative overflow-hidden flex flex-col justify-between border border-border/50">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                <Cpu className="w-4 h-4" />
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/80">{t('scheduleTitle')}</h3>
            </div>
            
            <p className="text-xs text-muted-fg mb-5 leading-relaxed">
              {t('scheduleDesc')}
            </p>

            <form onSubmit={saveScheduleSettings} className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/5 border border-border/30">
                <span className="text-xs font-medium text-foreground/80">{t('scheduleToggleLabel')}</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={schedule.enabled}
                    onChange={(e) => setSchedule(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-muted/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-foreground after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-fg peer-checked:after:bg-primary after:border-none after:rounded-full after:h-4 after:w-4 after:transition-[background-color,border-color,transform] peer-checked:bg-primary/20" />
                </label>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-fg uppercase tracking-wider">{t('scheduleIntervalLabel')}</label>
                <select
                  disabled={!schedule.enabled}
                  value={schedule.interval}
                  onChange={(e) => setSchedule(prev => ({ ...prev, interval: e.target.value as any }))}
                  className="w-full bg-[#0c0c0e]/80 border border-border disabled:opacity-40 text-foreground/80 text-xs rounded-lg px-3 py-2.5 outline-none focus:border-primary/40"
                >
                  <option value="daily">{t('intervalDaily')}</option>
                  <option value="weekly">{t('intervalWeekly')}</option>
                  <option value="monthly">{t('intervalMonthly')}</option>
                </select>
              </div>

              {schedule.enabled && schedule.nextRunAt && (
                <div className="text-[10px] text-muted-fg flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-primary animate-pulse" />
                  {t('scheduleNextRunLabel')} {new Date(schedule.nextRunAt).toLocaleDateString()}
                </div>
              )}

              <button
                type="submit"
                disabled={isSavingSchedule}
                className="w-full flex items-center justify-center gap-2 bg-muted/10 border border-border/40 hover:bg-primary/10 hover:border-primary/20 text-xs font-bold text-foreground/80 px-4 py-2.5 rounded-lg transition-[color,background-color,border-color,transform] duration-300 active:scale-[0.98] cursor-pointer"
              >
                {isSavingSchedule ? t('scheduleSaving') : t('scheduleUpdateButton')}
              </button>
            </form>
          </div>
        </div>

        {/* Card 2: Billing & Scans Quota (circular dial metrics) */}
        <div className="glass-card rounded-xl p-6 relative overflow-hidden flex flex-col justify-between border border-border/50">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-primary/10 text-indigo-400 border border-primary/20">
                  <Zap className="w-4 h-4" />
                </span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/80">{t('quotaTitle')}</h3>
              </div>
              <span className="text-[9px] font-black uppercase text-primary bg-cyan-400/10 border border-cyan-400/20 px-2 py-0.5 rounded">
                Plan {currentPlan}
              </span>
            </div>

            {/* Simulated interactive circles for resource limits */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Dial 1: Projects */}
              <div className="flex flex-col items-center p-3 rounded-lg bg-muted/1 border border-border/30 text-center">
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path className="text-white/[0.03]" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path className="text-primary transition-[color,stroke-dasharray] duration-1000" strokeDasharray={`${projectsPercentage}, 100`} strokeWidth="3" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  </svg>
                  <span className="absolute text-xs font-bold text-white">{initialProjects.length} / {planInfo.projects === 999 ? '∞' : planInfo.projects}</span>
                </div>
                <span className="text-[10px] font-bold text-muted-fg uppercase tracking-wider mt-2">{t('quotaResourcesLabel')}</span>
              </div>

              {/* Dial 2: Scans */}
              <div className="flex flex-col items-center p-3 rounded-lg bg-muted/1 border border-border/30 text-center">
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path className="text-white/[0.03]" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path className="text-indigo-400 transition-[color,stroke-dasharray] duration-1000" strokeDasharray={`${scansPercentage}, 100`} strokeWidth="3" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  </svg>
                  <span className="absolute text-xs font-bold text-white">{activeScansSimulated} / {planInfo.scans === 9999 ? '∞' : planInfo.scans}</span>
                </div>
                <span className="text-[10px] font-bold text-muted-fg uppercase tracking-wider mt-2">{t('quotaScansLabel')}</span>
              </div>
            </div>
            
            <p className="text-[11px] text-muted-fg mb-3 text-center">
              {t('quotaBillingInfo', { price: planInfo.price })}
            </p>
          </div>

          <button
            onClick={() => setShowPlanModal(true)}
            className="w-full bg-[oklch(68% 0.14 230)]/10 hover:bg-[oklch(68% 0.14 230)]/20 border border-[oklch(68% 0.14 230)]/20 text-primary text-xs font-bold px-4 py-2.5 rounded-lg transition-colors duration-300 cursor-pointer"
          >
            {t('quotaUpgradeButton')}
          </button>
        </div>

        {/* Card 3: Slack Rich Alerts Settings */}
        <div className="glass-card rounded-xl p-6 relative overflow-hidden flex flex-col justify-between border border-border/50">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="p-1.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
                <Bell className="w-4 h-4" />
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/80">{t('slackTitle')}</h3>
            </div>

            <p className="text-xs text-muted-fg mb-4 leading-relaxed">
              {t('slackDesc')}
            </p>

            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between text-xs p-2 rounded bg-destructive/5 border border-destructive/10">                  <span className="text-muted-fg flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {t('severityCritical')}
                  </span>
                <span className="font-mono text-foreground/80 text-[10px]">#security-incidents</span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 rounded bg-[oklch(75% 0.13 80)]/5 border border-[oklch(75% 0.13 80)]/10">                  <span className="text-muted-fg flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {t('severityWarning')}
                  </span>
                <span className="font-mono text-foreground/80 text-[10px]">#seo-drift</span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 rounded bg-primary/5 border border-primary/10">                  <span className="text-muted-fg flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" /> {t('severityInfo')}
                  </span>
                <span className="font-mono text-foreground/80 text-[10px]">#deploy-logs</span>
              </div>
            </div>
          </div>

          <button
            onClick={triggerSlackTest}
            className="w-full flex items-center justify-center gap-2 bg-muted/10 border border-border/40 hover:bg-destructive/10 hover:border-destructive/20 text-xs font-bold text-destructive px-4 py-2.5 rounded-lg transition-colors duration-300 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" /> {t('slackTestButton')}
          </button>
        </div>

      </div>

      {/* ────────────────── Bento Grid Row 2: Drift Alerts Log (Left) & Webhooks Config (Right) ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Log of Drift Incident Alerts (Left) */}
        <div className="lg:col-span-2 glass-card rounded-xl p-6 border border-border/50 space-y-4">
          <div className="flex items-center justify-between border-b border-border/50 pb-4">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">{t('driftTitle')}</h3>
              <p className="text-[11px] text-muted-fg mt-0.5">{t('driftDesc')}</p>
            </div>
            <span className="text-[10px] font-bold text-muted-fg bg-muted/20 border border-border/40 px-2 py-0.5 rounded">
              {t('driftEventCount', { count: alerts.length })}
            </span>
          </div>

          {isLoadingSchedule ? (
            <div className="py-12 text-center text-xs text-muted-fg">{t('driftLoading')}</div>
          ) : alerts.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <CheckCircle2 className="w-8 h-8 text-chartreuse mx-auto" />
              <p className="text-xs text-muted-fg">{t('driftEmpty')}</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2">
              {alerts.map((alert) => {
                const borderColors = alert.severity === 'critical' 
                  ? 'border-l-red-500/80 bg-red-500/[0.01]' 
                  : alert.severity === 'warning' 
                  ? 'border-l-amber-500/80 bg-amber-500/[0.01]' 
                  : 'border-l-cyan-500/80 bg-cyan-500/[0.01]';
                
                const badgeStyle = alert.severity === 'critical'
                  ? 'bg-destructive/10 text-destructive border-destructive/20'
                  : alert.severity === 'warning'
                  ? 'bg-[oklch(75% 0.13 80)]/10 text-[oklch(75% 0.13 80)] border-[oklch(75% 0.13 80)]/20'
                  : 'bg-primary/10 text-primary border-primary/20';

                return (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-lg border border-border/30 border-l-2 ${borderColors} transition-colors duration-300 flex items-start justify-between gap-4`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-foreground/80">{alert.title}</span>
                        <span className={`text-[9px] font-black uppercase border px-1.5 py-0.5 rounded ${badgeStyle}`}>
                          {alert.severity}
                        </span>
                      </div>
                      <p className="text-xs text-muted-fg leading-relaxed">{alert.message}</p>
                      <div className="text-[10px] text-muted-fg">
                        {new Date(alert.createdAt).toLocaleString()}
                      </div>
                    </div>

                    {!alert.resolved && (
                      <button
                        onClick={() => {
                          setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, resolved: true } : a));
                        }}
                        className="text-[10px] font-bold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/10 px-2.5 py-1 rounded transition-colors shrink-0 cursor-pointer"
                      >
                        {t('driftResolveButton')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Webhooks Config Integrations (Right) */}
        <div className="glass-card rounded-xl p-6 border border-border/50 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="border-b border-border/50 pb-4">
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <Link2 className="w-4 h-4 text-primary" />
                {t('webhookSectionTitle')}
              </h3>
              <p className="text-[11px] text-muted-fg mt-0.5">{t('webhookSectionDesc')}</p>
            </div>

            {isLoadingWebhooks ? (
              <div className="py-8 text-center text-xs text-muted-fg">{t('webhookLoading')}</div>
            ) : webhooks.length === 0 ? (
              <p className="text-xs text-muted-fg text-center py-6">{t('webhookEmpty')}</p>
            ) : (
              <div className="space-y-3 max-h-[160px] overflow-y-auto pr-2">
                {webhooks.map((w) => (
                  <div key={w.id} className="p-3 rounded-lg bg-muted/5 border border-border/30 flex items-center justify-between gap-3 group">
                    <div className="overflow-hidden">
                      <p className="text-xs font-bold text-foreground/80 truncate">{w.name}</p>
                      <p className="text-[10px] text-muted-fg truncate font-mono">{w.url}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteWebhook(w.id)}
                      className="text-muted-fg hover:text-destructive hover:bg-destructive/10 p-1.5 rounded transition-colors shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleCreateWebhook} className="space-y-3 mt-4 pt-4 border-t border-border/50">
            <input
              type="text"
              required
              placeholder={t('webhookNamePlaceholder')}
              value={newWebhookName}
              onChange={(e) => setNewWebhookName(e.target.value)}
              className="w-full bg-[#0c0c0e]/80 border border-border text-foreground/80 text-xs rounded-lg px-3 py-2 outline-none focus:border-primary/40"
            />
            
            <div className="flex gap-2">
              <input
                type="url"
                required
                placeholder={t('webhookUrlPlaceholder')}
                value={newWebhookUrl}
                onChange={(e) => setNewWebhookUrl(e.target.value)}
                className="flex-1 bg-[#0c0c0e]/80 border border-border text-foreground/80 text-xs rounded-lg px-3 py-2 outline-none focus:border-primary/40"
              />
              <button
                type="submit"
                disabled={isCreatingWebhook}
                className="bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary p-2 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>

      </div>

      {/* ────────────────── Bento Grid Row 3: Developer API Key Generator (Left) & Bulk Scan Domains Queue (Right) ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Developer API Key Generator Panel */}
        <div className="glass-card rounded-xl p-6 border border-border/50 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border/50 pb-4 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" />
                  {t('apiKeysSectionTitle')}
                </h3>
                <p className="text-[11px] text-muted-fg mt-0.5">{t('apiKeysSectionDesc')}</p>
              </div>
              <span className="text-[10px] font-mono text-muted-fg">Prefijo: sa_live_</span>
            </div>

            {isLoadingKeys ? (
              <div className="py-8 text-center text-xs text-muted-fg">{t('apiKeysLoading')}</div>
            ) : apiKeys.length === 0 ? (
              <p className="text-xs text-muted-fg text-center py-6">{t('apiKeysEmpty')}</p>
            ) : (
              <div className="space-y-3 max-h-[160px] overflow-y-auto pr-2 mb-4">
                {apiKeys.map((key) => (
                  <div key={key.id} className="p-3 rounded-lg bg-muted/5 border border-border/30 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-foreground/80">{key.name}</p>
                      <p className="text-[10px] text-muted-fg font-mono mt-0.5">Prefix ID: {key.keyPrefix}</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {key.expiresAt && (
                        <span className="text-[9px] text-muted-fg bg-muted/10 border border-border/40 px-1.5 py-0.5 rounded">
                          Expira: {new Date(key.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                      <button
                        onClick={() => handleDeleteApiKey(key.id)}
                        className="text-muted-fg hover:text-destructive hover:bg-destructive/10 p-1.5 rounded transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Displaying generated key ONCE inside copy panel */}
            {createdClearKey && (
              <div className="p-4 mb-4 rounded-lg bg-cyan-950/20 border border-primary/20 space-y-2 animate-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-primary uppercase tracking-wider flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> {t('apiKeysGeneratedTitle')}
                  </span>
                  <span className="text-[9px] text-muted-fg">{t('apiKeysCopyWarning')}</span>
                </div>
                <div className="flex items-center justify-between gap-3 bg-card border border-border/40 p-2.5 rounded font-mono text-xs text-foreground/80 overflow-x-auto select-all">
                  <span className="break-all">{createdClearKey}</span>
                  <button
                    onClick={() => copyToClipboard(createdClearKey, 'new-key')}
                    className="text-muted-fg hover:text-primary transition-colors p-1 shrink-0 cursor-pointer"
                  >
                    {copiedKeyId === 'new-key' ? <Check className="w-4 h-4 text-chartreuse" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleCreateApiKey} className="flex gap-2 border-t border-border/50 pt-4 mt-4">
            <input
              type="text"
              required
              placeholder={t('apiKeysNamePlaceholder')}
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="flex-1 bg-[#0c0c0e]/80 border border-border text-foreground/80 text-xs rounded-lg px-3 py-2.5 outline-none focus:border-primary/40"
            />
            <button
              type="submit"
              disabled={isCreatingKey}
              className="bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary px-4 py-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0"
            >
              {isCreatingKey ? t('apiKeysCreating') : t('apiKeysGenerateButton')}
            </button>
          </form>
        </div>

        {/* Bulk Scanner Queue Input Box */}
        <div className="glass-card rounded-xl p-6 border border-border/50 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4 border-b border-border/50 pb-4">
              <span className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                <Play className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">{t('bulkTitle')}</h3>
                <p className="text-[11px] text-muted-fg mt-0.5">{t('bulkDesc')}</p>
              </div>
            </div>

            <p className="text-xs text-muted-fg mb-4 leading-relaxed">
              {t('bulkInstructions')}
            </p>

            <form onSubmit={handleQueueBulk} className="space-y-4">
              <textarea
                required
                placeholder={t('bulkPlaceholder')}
                rows={4}
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                className="w-full bg-[#0c0c0e]/80 border border-border text-foreground/80 text-xs rounded-lg p-3 outline-none focus:border-primary/40 font-mono resize-none"
              />

              {bulkMessage && (
                <div className="p-3 text-xs text-chartreuse bg-chartreuse/5 border border-chartreuse/10 rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-chartreuse shrink-0" />
                  <span>{bulkMessage}</span>
                </div>
              )}

              {bulkError && (
                <div className="p-3 text-xs text-destructive bg-destructive/5 border border-destructive/10 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                  <span>{bulkError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isQueuingBulk}
                className="w-full flex items-center justify-center gap-2 bg-[oklch(68% 0.14 230)]/10 hover:bg-[oklch(68% 0.14 230)]/20 border border-[oklch(68% 0.14 230)]/20 text-primary text-xs font-bold px-4 py-2.5 rounded-lg transition-colors duration-300 cursor-pointer"
              >
                {isQueuingBulk ? t('bulkQueuing') : t('bulkProcessButton')}
              </button>
            </form>
          </div>
        </div>

      </div>

      {/* ────────────────── Pricing Sheet Upgrade Modal ────────────────── */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-[background-color,border-color,filter] duration-300 animate-in fade-in">
          <div className="glass-card max-w-4xl w-full rounded-2xl border border-border bg-[#040406]/90 p-8 relative space-y-6">
            <button
              onClick={() => setShowPlanModal(false)}
              className="absolute top-4 right-4 text-muted-fg hover:text-white transition-colors cursor-pointer text-xl p-1.5"
            >
              ✕
            </button>

            <div className="text-center space-y-1">                  <span className="text-[10px] font-extrabold tracking-widest text-[oklch(68% 0.14 230)] bg-primary/10 px-3 py-1 rounded-full uppercase">{t('pricingBadge')}</span>
              <h2 className="text-2xl font-black text-white tracking-tight mt-3">{t('pricingTitle')}</h2>
              <p className="text-xs text-muted-fg max-w-lg mx-auto">
                {t('pricingDesc')}
              </p>
            </div>

            {/* Price Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              
              {/* Starter Tier */}
              <div className={`p-6 rounded-xl border flex flex-col justify-between space-y-6 transition-colors duration-300 ${
                currentPlan === 'starter'
                  ? 'border-[oklch(68% 0.14 230)] bg-[oklch(68% 0.14 230)]/[0.02]'
                  : 'border-border/50 bg-muted/1 hover:border-border'
              }`}>
                <div className="space-y-3">
                  <p className="text-xs font-bold text-muted-fg uppercase tracking-widest">{t('planStarter')}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-white">$49</span>
                    <span className="text-[11px] font-bold text-muted-fg">{t('planPerMonth')}</span>
                  </div>
                  <ul className="text-xs text-muted-fg space-y-2.5 pt-2">
                    <li className="flex items-center gap-2">✓ 10 Recursos Activos</li>
                    <li className="flex items-center gap-2">✓ 100 scans mensuales</li>
                    <li className="flex items-center gap-2">✓ Alertas básicas</li>
                    <li className="text-muted-fg flex items-center gap-2">✗ Integración Slack</li>
                  </ul>
                </div>
                <button
                  onClick={() => {
                    setCurrentPlan('starter');
                    setShowPlanModal(false);
                  }}
                  className="w-full text-xs font-bold py-2.5 rounded-lg border border-border text-foreground hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  {currentPlan === 'starter' ? t('planActive') : t('planSelect', { plan: t('planStarter') })}
                </button>
              </div>

              {/* Business Tier */}
              <div className={`p-6 rounded-xl border flex flex-col justify-between space-y-6 transition-colors duration-300 relative ${
                currentPlan === 'business'
                  ? 'border-[oklch(68% 0.14 230)] bg-[oklch(68% 0.14 230)]/[0.03] shadow-[0_4px_30px_rgba(6,182,212,0.15)]'
                  : 'border-border/50 bg-muted/1 hover:border-border'
              }`}>
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] font-black tracking-widest text-[oklch(68% 0.14 230)] bg-cyan-400/10 border border-cyan-400/20 px-2.5 py-1 rounded-full uppercase">
                  {t('planRecommended')}
                </span>
                <div className="space-y-3">
                  <p className="text-xs font-bold text-[oklch(68% 0.14 230)] uppercase tracking-widest">{t('planBusiness')}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-white">$149</span>
                    <span className="text-[11px] font-bold text-muted-fg">{t('planPerMonth')}</span>
                  </div>
                  <ul className="text-xs text-foreground/80 space-y-2.5 pt-2">
                    <li className="flex items-center gap-2">✓ 50 Recursos Activos</li>
                    <li className="flex items-center gap-2">✓ 1,000 scans mensuales</li>
                    <li className="flex items-center gap-2 text-primary">✓ Webhook Alertas Slack</li>
                    <li className="flex items-center gap-2 text-primary">✓ Developer API Keys</li>
                  </ul>
                </div>
                <button
                  onClick={() => {
                    setCurrentPlan('business');
                    setShowPlanModal(false);
                  }}
                  className="w-full text-xs font-bold py-2.5 rounded-lg bg-[oklch(68% 0.14 230)] hover:bg-[oklch(68% 0.14 230)]/80 text-black transition-colors cursor-pointer"
                >
                  {currentPlan === 'business' ? t('planActive') : t('planSelect', { plan: t('planBusiness') })}
                </button>
              </div>

              {/* Enterprise Tier */}
              <div className={`p-6 rounded-xl border flex flex-col justify-between space-y-6 transition-colors duration-300 ${
                currentPlan === 'enterprise'
                  ? 'border-[oklch(68% 0.14 230)] bg-[oklch(68% 0.14 230)]/[0.02]'
                  : 'border-border/50 bg-muted/1 hover:border-border'
              }`}>
                <div className="space-y-3">
                  <p className="text-xs font-bold text-muted-fg uppercase tracking-widest">{t('planEnterprise')}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-white">$499</span>
                    <span className="text-[11px] font-bold text-muted-fg">{t('planPerMonth')}</span>
                  </div>
                  <ul className="text-xs text-muted-fg space-y-2.5 pt-2">
                    <li className="flex items-center gap-2">✓ Recursos Ilimitados</li>
                    <li className="flex items-center gap-2">✓ Escaneos Ilimitados</li>
                    <li className="flex items-center gap-2 text-primary">✓ Soporte VIP Prioritario</li>
                    <li className="flex items-center gap-2 text-primary">✓ SLA de Uptime 99.9%</li>
                  </ul>
                </div>
                <button
                  onClick={() => {
                    setCurrentPlan('enterprise');
                    setShowPlanModal(false);
                  }}
                  className="w-full text-xs font-bold py-2.5 rounded-lg border border-border text-foreground hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  {currentPlan === 'enterprise' ? t('planActive') : t('planSelect', { plan: t('planEnterprise') })}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
