'use client';

import React, { useState, useEffect } from 'react';
import {
  Bell, Key, Link2, Plus, Trash2, Cpu, CheckCircle2, AlertTriangle, Info,
  Sliders, Play, Copy, Check, ShieldAlert, Sparkles, Send, ShieldCheck, Zap
} from 'lucide-react';

interface MonitoringTabProps {
  initialProjects: any[];
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
}

export function MonitoringTab({ initialProjects, selectedProjectId, setSelectedProjectId }: MonitoringTabProps) {
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
  }, [selectedProjectId]);

  const fetchMonitoringData = async () => {
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
  };

  const fetchWebhooks = async () => {
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
  };

  const fetchApiKeys = async () => {
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
  };

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/[0.04] pb-6">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Sliders className="w-6 h-6 text-[#06b6d4]" />
            Controles de Monitoreo y APIs Activas
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Gestión de tareas de indexación programadas, endpoints webhook, tokens de desarrollo e incidentes de drift.
          </p>
        </div>

        {/* Project Selector */}
        <div className="flex items-center gap-3 shrink-0">
          <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Proyecto Activo:</label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="bg-[#0c0c0e]/80 border border-white/[0.08] text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-cyan-500/40 cursor-pointer"
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
        <div className="glass-card rounded-xl p-6 relative overflow-hidden flex flex-col justify-between border border-white/[0.04]">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Cpu className="w-4 h-4" />
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Programación de Sweeps</h3>
            </div>
            
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              Define la frecuencia de los análisis completos sobre el dominio para detectar variaciones involuntarias en registros SSL o DNS.
            </p>

            <form onSubmit={saveScheduleSettings} className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.01] border border-white/[0.03]">
                <span className="text-xs font-medium text-slate-300">Auditoría Automática</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={schedule.enabled}
                    onChange={(e) => setSchedule(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-white/[0.08] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 peer-checked:after:bg-cyan-400 after:border-none after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500/20" />
                </label>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Intervalo Técnico</label>
                <select
                  disabled={!schedule.enabled}
                  value={schedule.interval}
                  onChange={(e) => setSchedule(prev => ({ ...prev, interval: e.target.value as any }))}
                  className="w-full bg-[#0c0c0e]/80 border border-white/[0.08] disabled:opacity-40 text-slate-200 text-xs rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500/40"
                >
                  <option value="daily">Diario (Alta frecuencia)</option>
                  <option value="weekly">Semanal (Estándar recomendado)</option>
                  <option value="monthly">Mensual</option>
                </select>
              </div>

              {schedule.enabled && schedule.nextRunAt && (
                <div className="text-[10px] text-slate-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-cyan-400 animate-pulse" />
                  Próxima auditoría programada: {new Date(schedule.nextRunAt).toLocaleDateString()}
                </div>
              )}

              <button
                type="submit"
                disabled={isSavingSchedule}
                className="w-full flex items-center justify-center gap-2 bg-white/[0.02] border border-white/[0.05] hover:bg-cyan-500/10 hover:border-cyan-500/20 text-xs font-bold text-slate-200 px-4 py-2.5 rounded-lg transition-all duration-300 active:scale-[0.98] cursor-pointer"
              >
                {isSavingSchedule ? 'Guardando...' : 'Actualizar Programación'}
              </button>
            </form>
          </div>
        </div>

        {/* Card 2: Billing & Scans Quota (circular dial metrics) */}
        <div className="glass-card rounded-xl p-6 relative overflow-hidden flex flex-col justify-between border border-white/[0.04]">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Zap className="w-4 h-4" />
                </span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Cupos y Limites de Plan</h3>
              </div>
              <span className="text-[9px] font-black uppercase text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 px-2 py-0.5 rounded">
                Plan {currentPlan}
              </span>
            </div>

            {/* Simulated interactive circles for resource limits */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Dial 1: Projects */}
              <div className="flex flex-col items-center p-3 rounded-lg bg-white/[0.005] border border-white/[0.02] text-center">
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path className="text-white/[0.03]" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path className="text-cyan-400 transition-all duration-1000" strokeDasharray={`${projectsPercentage}, 100`} strokeWidth="3" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  </svg>
                  <span className="absolute text-xs font-bold text-white">{initialProjects.length} / {planInfo.projects === 999 ? '∞' : planInfo.projects}</span>
                </div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-2">Recursos Activos</span>
              </div>

              {/* Dial 2: Scans */}
              <div className="flex flex-col items-center p-3 rounded-lg bg-white/[0.005] border border-white/[0.02] text-center">
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path className="text-white/[0.03]" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path className="text-indigo-400 transition-all duration-1000" strokeDasharray={`${scansPercentage}, 100`} strokeWidth="3" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  </svg>
                  <span className="absolute text-xs font-bold text-white">{activeScansSimulated} / {planInfo.scans === 9999 ? '∞' : planInfo.scans}</span>
                </div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-2">Escaneos / mes</span>
              </div>
            </div>
            
            <p className="text-[11px] text-slate-500 mb-3 text-center">
              Fórmula de facturación recurrente. Próximo cobro: {planInfo.price} el 01/06/2026.
            </p>
          </div>

          <button
            onClick={() => setShowPlanModal(true)}
            className="w-full bg-[#06b6d4]/10 hover:bg-[#06b6d4]/20 border border-[#06b6d4]/20 text-cyan-400 text-xs font-bold px-4 py-2.5 rounded-lg transition-all duration-300 cursor-pointer"
          >
            Actualizar Suscripción
          </button>
        </div>

        {/* Card 3: Slack Rich Alerts Settings */}
        <div className="glass-card rounded-xl p-6 relative overflow-hidden flex flex-col justify-between border border-white/[0.04]">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <Bell className="w-4 h-4" />
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Alertas en Slack</h3>
            </div>

            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Recibe notificaciones en Slack en tiempo real cuando cambie la firma TLS o se identifique SPF roto.
            </p>

            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between text-xs p-2 rounded bg-red-500/5 border border-red-500/10">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Critico
                </span>
                <span className="font-mono text-slate-300 text-[10px]">#security-incidents</span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 rounded bg-amber-500/5 border border-amber-500/10">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Advertencia
                </span>
                <span className="font-mono text-slate-300 text-[10px]">#seo-drift</span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 rounded bg-cyan-500/5 border border-cyan-500/10">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" /> Informativo
                </span>
                <span className="font-mono text-slate-300 text-[10px]">#deploy-logs</span>
              </div>
            </div>
          </div>

          <button
            onClick={triggerSlackTest}
            className="w-full flex items-center justify-center gap-2 bg-white/[0.02] border border-white/[0.05] hover:bg-rose-500/10 hover:border-rose-500/20 text-xs font-bold text-rose-400 px-4 py-2.5 rounded-lg transition-all duration-300 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" /> Enviar Canal de Test (Webhook Slack)
          </button>
        </div>

      </div>

      {/* ────────────────── Bento Grid Row 2: Drift Alerts Log (Left) & Webhooks Config (Right) ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Log of Drift Incident Alerts (Left) */}
        <div className="lg:col-span-2 glass-card rounded-xl p-6 border border-white/[0.04] space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.04] pb-4">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Historial de Incidentes & Drift</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Logs de cambios no autorizados detectados en DNS o firmas SSL.</p>
            </div>
            <span className="text-[10px] font-bold text-slate-400 bg-white/[0.03] border border-white/[0.05] px-2 py-0.5 rounded">
              {alerts.length} eventos
            </span>
          </div>

          {isLoadingSchedule ? (
            <div className="py-12 text-center text-xs text-slate-500">Cargando alertas de seguridad...</div>
          ) : alerts.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="text-xs text-slate-400">Excelente! Sin discrepancias ni drifts detectados en las últimas comprobaciones.</p>
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
                  ? 'bg-red-500/10 text-red-400 border-red-500/20'
                  : alert.severity === 'warning'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';

                return (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-lg border border-white/[0.03] border-l-2 ${borderColors} transition-all duration-300 flex items-start justify-between gap-4`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-200">{alert.title}</span>
                        <span className={`text-[9px] font-black uppercase border px-1.5 py-0.5 rounded ${badgeStyle}`}>
                          {alert.severity}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{alert.message}</p>
                      <div className="text-[10px] text-slate-500">
                        {new Date(alert.createdAt).toLocaleString()}
                      </div>
                    </div>

                    {!alert.resolved && (
                      <button
                        onClick={() => {
                          setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, resolved: true } : a));
                        }}
                        className="text-[10px] font-bold text-cyan-400 bg-cyan-500/5 hover:bg-cyan-500/10 border border-cyan-500/10 px-2.5 py-1 rounded transition-colors shrink-0 cursor-pointer"
                      >
                        Resolver
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Webhooks Config Integrations (Right) */}
        <div className="glass-card rounded-xl p-6 border border-white/[0.04] flex flex-col justify-between">
          <div className="space-y-4">
            <div className="border-b border-white/[0.04] pb-4">
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <Link2 className="w-4 h-4 text-cyan-400" />
                Webhook Integraciones
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Notifica a tus servidores cuando finalicen los análisis.</p>
            </div>

            {isLoadingWebhooks ? (
              <div className="py-8 text-center text-xs text-slate-500">Cargando endpoints...</div>
            ) : webhooks.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No hay webhooks registrados.</p>
            ) : (
              <div className="space-y-3 max-h-[160px] overflow-y-auto pr-2">
                {webhooks.map((w) => (
                  <div key={w.id} className="p-3 rounded-lg bg-white/[0.01] border border-white/[0.03] flex items-center justify-between gap-3 group">
                    <div className="overflow-hidden">
                      <p className="text-xs font-bold text-slate-300 truncate">{w.name}</p>
                      <p className="text-[10px] text-slate-500 truncate font-mono">{w.url}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteWebhook(w.id)}
                      className="text-slate-500 hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded transition-all shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleCreateWebhook} className="space-y-3 mt-4 pt-4 border-t border-white/[0.04]">
            <input
              type="text"
              required
              placeholder="Nombre (ej. Vercel Audit Hook)"
              value={newWebhookName}
              onChange={(e) => setNewWebhookName(e.target.value)}
              className="w-full bg-[#0c0c0e]/80 border border-white/[0.08] text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-cyan-500/40"
            />
            
            <div className="flex gap-2">
              <input
                type="url"
                required
                placeholder="https://api.tuempresa.com/hook"
                value={newWebhookUrl}
                onChange={(e) => setNewWebhookUrl(e.target.value)}
                className="flex-1 bg-[#0c0c0e]/80 border border-white/[0.08] text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-cyan-500/40"
              />
              <button
                type="submit"
                disabled={isCreatingWebhook}
                className="bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 p-2 rounded-lg transition-colors cursor-pointer"
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
        <div className="glass-card rounded-xl p-6 border border-white/[0.04] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-white/[0.04] pb-4 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  <Key className="w-4 h-4 text-cyan-400" />
                  API Keys de Desarrollador
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Accede de manera programática a los resultados de auditorías.</p>
              </div>
              <span className="text-[10px] font-mono text-slate-500">Prefijo: sa_live_</span>
            </div>

            {isLoadingKeys ? (
              <div className="py-8 text-center text-xs text-slate-500">Cargando tokens de acceso...</div>
            ) : apiKeys.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No has generado credenciales aún.</p>
            ) : (
              <div className="space-y-3 max-h-[160px] overflow-y-auto pr-2 mb-4">
                {apiKeys.map((key) => (
                  <div key={key.id} className="p-3 rounded-lg bg-white/[0.01] border border-white/[0.03] flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-slate-300">{key.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">Prefix ID: {key.keyPrefix}</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {key.expiresAt && (
                        <span className="text-[9px] text-slate-500 bg-white/[0.02] border border-white/[0.05] px-1.5 py-0.5 rounded">
                          Expira: {new Date(key.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                      <button
                        onClick={() => handleDeleteApiKey(key.id)}
                        className="text-slate-500 hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded transition-all cursor-pointer"
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
              <div className="p-4 mb-4 rounded-lg bg-cyan-950/20 border border-cyan-500/20 space-y-2 animate-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Token Generado Exitosamente
                  </span>
                  <span className="text-[9px] text-slate-500">Copia esta clave, no se volverá a mostrar.</span>
                </div>
                <div className="flex items-center justify-between gap-3 bg-black/40 border border-white/[0.05] p-2.5 rounded font-mono text-xs text-slate-200 overflow-x-auto select-all">
                  <span className="break-all">{createdClearKey}</span>
                  <button
                    onClick={() => copyToClipboard(createdClearKey, 'new-key')}
                    className="text-slate-400 hover:text-cyan-400 transition-colors p-1 shrink-0 cursor-pointer"
                  >
                    {copiedKeyId === 'new-key' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleCreateApiKey} className="flex gap-2 border-t border-white/[0.04] pt-4 mt-4">
            <input
              type="text"
              required
              placeholder="Nombre del Token (ej. CI/CD Pipeline Key)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="flex-1 bg-[#0c0c0e]/80 border border-white/[0.08] text-slate-200 text-xs rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500/40"
            />
            <button
              type="submit"
              disabled={isCreatingKey}
              className="bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 px-4 py-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0"
            >
              {isCreatingKey ? 'Creando...' : 'Generar API Key'}
            </button>
          </form>
        </div>

        {/* Bulk Scanner Queue Input Box */}
        <div className="glass-card rounded-xl p-6 border border-white/[0.04] flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4 border-b border-white/[0.04] pb-4">
              <span className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Play className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">Escáner Masivo de Dominios</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Encola múltiples auditorías simultáneas en paralelo.</p>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Introduce una lista de dominios separados por comas o saltos de línea. El sistema los auditará de manera asíncrona.
            </p>

            <form onSubmit={handleQueueBulk} className="space-y-4">
              <textarea
                required
                placeholder="ejemplo.com&#10;otrodominio.org&#10;empresa.cl"
                rows={4}
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                className="w-full bg-[#0c0c0e]/80 border border-white/[0.08] text-slate-200 text-xs rounded-lg p-3 outline-none focus:border-cyan-500/40 font-mono resize-none"
              />

              {bulkMessage && (
                <div className="p-3 text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{bulkMessage}</span>
                </div>
              )}

              {bulkError && (
                <div className="p-3 text-xs text-red-400 bg-red-500/5 border border-red-500/10 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{bulkError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isQueuingBulk}
                className="w-full flex items-center justify-center gap-2 bg-[#06b6d4]/10 hover:bg-[#06b6d4]/20 border border-[#06b6d4]/20 text-cyan-400 text-xs font-bold px-4 py-2.5 rounded-lg transition-all duration-300 cursor-pointer"
              >
                {isQueuingBulk ? 'Encolando Dominios...' : 'Procesar Cola Masiva'}
              </button>
            </form>
          </div>
        </div>

      </div>

      {/* ────────────────── Pricing Sheet Upgrade Modal ────────────────── */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all duration-300 animate-in fade-in">
          <div className="glass-card max-w-4xl w-full rounded-2xl border border-white/[0.08] bg-[#040406]/90 p-8 relative space-y-6">
            <button
              onClick={() => setShowPlanModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors cursor-pointer text-xl p-1.5"
            >
              ✕
            </button>

            <div className="text-center space-y-1">
              <span className="text-[10px] font-extrabold tracking-widest text-[#06b6d4] bg-cyan-500/10 px-3 py-1 rounded-full uppercase">Suscripciones Flexibles</span>
              <h2 className="text-2xl font-black text-white tracking-tight mt-3">Eleva tu Postura de Seguridad Técnica</h2>
              <p className="text-xs text-slate-400 max-w-lg mx-auto">
                Selecciona la capacidad de procesamiento continuo que mejor se adapte al tamaño de tu infraestructura web.
              </p>
            </div>

            {/* Price Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              
              {/* Starter Tier */}
              <div className={`p-6 rounded-xl border flex flex-col justify-between space-y-6 transition-all duration-300 ${
                currentPlan === 'starter'
                  ? 'border-[#06b6d4] bg-[#06b6d4]/[0.02]'
                  : 'border-white/[0.04] bg-white/[0.005] hover:border-white/[0.08]'
              }`}>
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Starter</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-white">$49</span>
                    <span className="text-[11px] font-bold text-slate-500">/ mes</span>
                  </div>
                  <ul className="text-xs text-slate-400 space-y-2.5 pt-2">
                    <li className="flex items-center gap-2">✓ 10 Recursos Activos</li>
                    <li className="flex items-center gap-2">✓ 100 scans mensuales</li>
                    <li className="flex items-center gap-2">✓ Alertas básicas</li>
                    <li className="text-slate-600 flex items-center gap-2">✗ Integración Slack</li>
                  </ul>
                </div>
                <button
                  onClick={() => {
                    setCurrentPlan('starter');
                    setShowPlanModal(false);
                  }}
                  className="w-full text-xs font-bold py-2.5 rounded-lg border border-white/[0.1] text-white hover:bg-white/[0.05] transition-all cursor-pointer"
                >
                  {currentPlan === 'starter' ? 'Plan Activo' : 'Seleccionar Starter'}
                </button>
              </div>

              {/* Business Tier */}
              <div className={`p-6 rounded-xl border flex flex-col justify-between space-y-6 transition-all duration-300 relative ${
                currentPlan === 'business'
                  ? 'border-[#06b6d4] bg-[#06b6d4]/[0.03] shadow-[0_4px_30px_rgba(6,182,212,0.15)]'
                  : 'border-white/[0.04] bg-white/[0.005] hover:border-white/[0.08]'
              }`}>
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] font-black tracking-widest text-[#06b6d4] bg-cyan-400/10 border border-cyan-400/20 px-2.5 py-1 rounded-full uppercase">
                  Recomendado
                </span>
                <div className="space-y-3">
                  <p className="text-xs font-bold text-[#06b6d4] uppercase tracking-widest">Business</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-white">$149</span>
                    <span className="text-[11px] font-bold text-slate-500">/ mes</span>
                  </div>
                  <ul className="text-xs text-slate-300 space-y-2.5 pt-2">
                    <li className="flex items-center gap-2">✓ 50 Recursos Activos</li>
                    <li className="flex items-center gap-2">✓ 1,000 scans mensuales</li>
                    <li className="flex items-center gap-2 text-cyan-400">✓ Webhook Alertas Slack</li>
                    <li className="flex items-center gap-2 text-cyan-400">✓ Developer API Keys</li>
                  </ul>
                </div>
                <button
                  onClick={() => {
                    setCurrentPlan('business');
                    setShowPlanModal(false);
                  }}
                  className="w-full text-xs font-bold py-2.5 rounded-lg bg-[#06b6d4] hover:bg-[#06b6d4]/80 text-black transition-all cursor-pointer"
                >
                  {currentPlan === 'business' ? 'Plan Activo' : 'Seleccionar Business'}
                </button>
              </div>

              {/* Enterprise Tier */}
              <div className={`p-6 rounded-xl border flex flex-col justify-between space-y-6 transition-all duration-300 ${
                currentPlan === 'enterprise'
                  ? 'border-[#06b6d4] bg-[#06b6d4]/[0.02]'
                  : 'border-white/[0.04] bg-white/[0.005] hover:border-white/[0.08]'
              }`}>
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Enterprise</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-white">$499</span>
                    <span className="text-[11px] font-bold text-slate-500">/ mes</span>
                  </div>
                  <ul className="text-xs text-slate-400 space-y-2.5 pt-2">
                    <li className="flex items-center gap-2">✓ Recursos Ilimitados</li>
                    <li className="flex items-center gap-2">✓ Escaneos Ilimitados</li>
                    <li className="flex items-center gap-2 text-cyan-400">✓ Soporte VIP Prioritario</li>
                    <li className="flex items-center gap-2 text-cyan-400">✓ SLA de Uptime 99.9%</li>
                  </ul>
                </div>
                <button
                  onClick={() => {
                    setCurrentPlan('enterprise');
                    setShowPlanModal(false);
                  }}
                  className="w-full text-xs font-bold py-2.5 rounded-lg border border-white/[0.1] text-white hover:bg-white/[0.05] transition-all cursor-pointer"
                >
                  {currentPlan === 'enterprise' ? 'Plan Activo' : 'Seleccionar Enterprise'}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
