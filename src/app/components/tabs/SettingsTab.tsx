'use client';

import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Palette, 
  Save, 
  Key, 
  Globe, 
  Trash2, 
  Plus, 
  Check, 
  Copy, 
  Loader2, 
  AlertTriangle, 
  ShieldCheck, 
  Info
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  domain: string;
}

interface SettingsTabProps {
  initialProjects?: Project[];
  selectedProjectId?: string;
  setSelectedProjectId?: (id: string) => void;
}

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scope: string[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

interface WebhookConfig {
  id: string;
  projectId: string;
  name: string;
  url: string;
  secretToken: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

export function SettingsTab({ 
  initialProjects = [], 
  selectedProjectId = '', 
  setSelectedProjectId 
}: SettingsTabProps) {
  // Global agency branding settings (localStorage)
  const [agencyName, setAgencyName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#06b6d4');
  const [logoUrl, setLogoUrl] = useState('');

  // Clipboard copied tracker
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [keysError, setKeysError] = useState<string | null>(null);
  
  // Create API Key state
  const [newKeyName, setNewKeyName] = useState('');
  const [expiresDays, setExpiresDays] = useState<number>(0); // 0 = never, 30, 90, 365
  const [creatingKey, setCreatingKey] = useState(false);
  const [revealedClearKey, setRevealedClearKey] = useState<string | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);

  // Webhooks state
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loadingWebhooks, setLoadingWebhooks] = useState(false);
  const [webhooksError, setWebhooksError] = useState<string | null>(null);
  
  // Create Webhook state
  const [newWebhookName, setNewWebhookName] = useState('');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<string[]>(['audit.completed', 'alert.triggered']);
  const [webhookActive, setWebhookActive] = useState(true);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [revealedWebhookSecret, setRevealedWebhookSecret] = useState<string | null>(null);
  const [showWebhookModal, setShowWebhookModal] = useState(false);

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Load Branding Preferencias from LocalStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('agencyBranding');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setAgencyName(parsed.name || '');
          setPrimaryColor(parsed.color || '#06b6d4');
          setLogoUrl(parsed.logoUrl || '');
        } catch (e) {
          console.error("Failed to parse branding config", e);
        }
      }
    }
  }, []);

  // Save Branding to LocalStorage
  const handleSaveBranding = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('agencyBranding', JSON.stringify({
        name: agencyName,
        color: primaryColor,
        logoUrl: logoUrl
      }));
      alert("¡Configuración de marca blanca guardada correctamente!");
    }
  };

  // Fetch API Keys
  const fetchApiKeys = async () => {
    setLoadingKeys(true);
    setKeysError(null);
    try {
      const res = await fetch('/api/api-keys');
      const data = await res.json();
      if (data.success) {
        setApiKeys(data.apiKeys || []);
      } else {
        setKeysError(data.error || 'Error al obtener llaves');
      }
    } catch (err: any) {
      setKeysError(err.message || 'Error de conexión');
    } finally {
      setLoadingKeys(false);
    }
  };

  // Fetch Webhooks for current Project
  const fetchWebhooks = async (projId: string) => {
    if (!projId) return;
    setLoadingWebhooks(true);
    setWebhooksError(null);
    try {
      const res = await fetch(`/api/webhooks?projectId=${projId}`);
      const data = await res.json();
      if (data.success) {
        setWebhooks(data.webhooks || []);
      } else {
        setWebhooksError(data.error || 'Error al obtener webhooks');
      }
    } catch (err: any) {
      setWebhooksError(err.message || 'Error de conexión');
    } finally {
      setLoadingWebhooks(false);
    }
  };

  // Initial loads
  useEffect(() => {
    fetchApiKeys();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchWebhooks(selectedProjectId);
    }
  }, [selectedProjectId]);

  // Create API Key
  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    setKeysError(null);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName.trim(),
          expiresDays: expiresDays > 0 ? expiresDays : undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        setRevealedClearKey(data.clearKey);
        setShowKeyModal(true);
        setNewKeyName('');
        setExpiresDays(0);
        fetchApiKeys(); // reload
      } else {
        setKeysError(data.error || 'Error al crear la llave');
      }
    } catch (err: any) {
      setKeysError(err.message || 'Error de conexión al crear llave');
    } finally {
      setCreatingKey(false);
    }
  };

  // Revoke API Key
  const handleRevokeApiKey = async (id: string) => {
    if (!confirm('¿Está seguro de que desea revocar esta llave de API? Los sistemas integrados que la usen perderán el acceso de inmediato.')) {
      return;
    }
    try {
      const res = await fetch(`/api/api-keys?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchApiKeys();
      } else {
        alert(`Error al revocar llave: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error de red al revocar llave: ${err.message}`);
    }
  };

  // Create Webhook
  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWebhookName.trim() || !newWebhookUrl.trim() || !selectedProjectId) return;
    setCreatingWebhook(true);
    setWebhooksError(null);
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          name: newWebhookName.trim(),
          url: newWebhookUrl.trim(),
          events: webhookEvents,
          active: webhookActive
        })
      });
      const data = await res.json();
      if (data.success) {
        setRevealedWebhookSecret(data.webhook.secretToken);
        setShowWebhookModal(true);
        setNewWebhookName('');
        setNewWebhookUrl('');
        setWebhookEvents(['audit.completed', 'alert.triggered']);
        setWebhookActive(true);
        fetchWebhooks(selectedProjectId); // reload
      } else {
        setWebhooksError(data.error || 'Error al crear el webhook');
      }
    } catch (err: any) {
      setWebhooksError(err.message || 'Error de conexión al crear webhook');
    } finally {
      setCreatingWebhook(false);
    }
  };

  // Delete Webhook
  const handleDeleteWebhook = async (id: string) => {
    if (!confirm('¿Está seguro de que desea eliminar esta integración de webhook? Se detendrá el envío de eventos de inmediato.')) {
      return;
    }
    try {
      const res = await fetch(`/api/webhooks?id=${id}&projectId=${selectedProjectId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchWebhooks(selectedProjectId);
      } else {
        alert(`Error al eliminar webhook: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error de red al eliminar webhook: ${err.message}`);
    }
  };

  // Toggle webhook event checkbox
  const handleToggleEvent = (event: string) => {
    if (webhookEvents.includes(event)) {
      setWebhookEvents(webhookEvents.filter(e => e !== event));
    } else {
      setWebhookEvents([...webhookEvents, event]);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl font-sans text-zinc-100 relative z-10 space-y-10">
      
      {/* 1. Main System Settings Card */}
      <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-10 relative overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="mb-12 relative z-10">
          <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <Settings className="w-6 h-6 text-cyan-400" />
            Configuración del Sistema
          </h2>
          <p className="text-sm text-zinc-500 mt-2">Administre las credenciales de API, llaves de análisis y preferencias de personalización de su marca.</p>
        </div>

        <div className="space-y-12 relative z-10">
          {/* IA integrations */}
          <div className="space-y-6">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.06] pb-3">Integraciones de Inteligencia Artificial</h3>
            <div className="bg-white/[0.005] border border-white/[0.06] rounded-2xl p-8 hover:bg-white/[0.01] transition-all">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[15px] font-bold text-white tracking-tight">OpenRouter / LLM API Gateway</span>
                <span className="text-[9px] font-bold bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20 uppercase tracking-wider">Activo</span>
              </div>
              <p className="text-xs text-zinc-500 mb-6 leading-relaxed">El aprovisionamiento de modelos generativos se gestiona de forma segura a través de variables de entorno del servidor.</p>
              <input 
                type="password" 
                value="************************************************" 
                readOnly 
                className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-6 py-3.5 text-xs text-zinc-500 focus:outline-none font-mono tracking-wider" 
              />
            </div>
          </div>

          {/* White label settings */}
          <div className="space-y-6">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.06] pb-3 flex items-center gap-2">
              <Palette className="w-4 h-4 text-cyan-400" /> Marca Blanca (White Label)
            </h3>
            <div className="bg-white/[0.005] border border-white/[0.06] rounded-2xl p-8 hover:bg-white/[0.01] transition-all">
              <p className="text-xs text-zinc-500 mb-10 leading-relaxed">Personalice los informes y las plantillas ejecutivas PDF con la identidad y el logotipo de su agencia o cliente corporativo.</p>
              
              <div className="grid gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Nombre de la Agencia</label>
                  <input 
                    type="text" 
                    placeholder="Ej: Strategic SEO Agency" 
                    className="w-full bg-black/60 border border-white/[0.08] focus:border-cyan-500 rounded-xl px-6 py-3.5 text-sm text-zinc-200 font-bold focus:outline-none transition-all placeholder-zinc-700 focus:shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                    id="branding-name-input"
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Color Principal</label>
                    <div className="flex gap-4 items-center">
                      <input 
                        type="color" 
                        className="w-12 h-12 rounded-full border-2 border-white/[0.1] bg-transparent p-0 cursor-pointer overflow-hidden"
                        id="branding-color-picker"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                      />
                      <input 
                        type="text" 
                        id="branding-color-text"
                        placeholder="#06b6d4" 
                        className="flex-1 bg-black/60 border border-white/[0.08] focus:border-cyan-500 rounded-xl px-6 py-3.5 text-sm font-bold text-zinc-200 focus:outline-none transition-all uppercase placeholder-zinc-700"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Logo URL (PNG/SVG)</label>
                    <input 
                      type="text" 
                      placeholder="https://tudominio.com/logo.png" 
                      className="w-full bg-black/60 border border-white/[0.08] focus:border-cyan-500 rounded-xl px-6 py-3.5 text-sm text-zinc-200 font-bold focus:outline-none transition-all placeholder-zinc-700 focus:shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              
              <div className="mt-12 flex justify-end">
                <button 
                  onClick={handleSaveBranding}
                  className="bg-cyan-500 hover:bg-cyan-400 text-black px-10 py-3.5 rounded-xl text-[11px] font-extrabold uppercase tracking-widest shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.45)] transition-all flex items-center gap-3 group cursor-pointer"
                >
                  <Save className="w-4 h-4 group-hover:scale-110 transition-transform text-black" /> Guardar Preferencias
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Developer Integrations - API Keys */}
      <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-10 relative overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="mb-12 relative z-10">
          <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <Key className="w-6 h-6 text-cyan-400" />
            Llaves de API para Desarrolladores
          </h2>
          <p className="text-sm text-zinc-500 mt-2">
            Cree credenciales para autenticar llamadas directas de la API de StrategicAudit y automatizar sus flujos de auditoría externa.
          </p>
        </div>

        <div className="space-y-8 relative z-10">
          {/* Create Key Form */}
          <form onSubmit={handleCreateApiKey} className="bg-white/[0.005] border border-white/[0.06] rounded-2xl p-8 space-y-6">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <Plus className="w-4 h-4 text-cyan-400" /> Crear Nueva Llave de Acceso
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Nombre Descriptivo</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej: Servidor de Monitoreo Staging" 
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full bg-black/60 border border-white/[0.08] focus:border-cyan-500 rounded-xl px-5 py-3 text-sm text-zinc-200 font-bold focus:outline-none transition-all placeholder-zinc-700 focus:shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Periodo de Expiración</label>
                <select
                  value={expiresDays}
                  onChange={(e) => setExpiresDays(Number(e.target.value))}
                  className="w-full bg-black/60 border border-white/[0.08] focus:border-cyan-500 rounded-xl px-5 py-3 text-sm text-zinc-400 font-bold focus:outline-none transition-all focus:shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                >
                  <option value={0}>Sin expiración</option>
                  <option value={30}>30 Días</option>
                  <option value={90}>90 Días</option>
                  <option value={365}>365 Días</option>
                </select>
              </div>
            </div>

            {keysError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{keysError}</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={creatingKey || !newKeyName.trim()}
                className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-black px-8 py-3 rounded-xl text-[10px] font-extrabold uppercase tracking-widest shadow-[0_0_20px_rgba(6,182,212,0.2)] transition-all flex items-center gap-2 cursor-pointer"
              >
                {creatingKey ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" /> Generando...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 text-black" /> Generar API Key
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Active Keys List */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-white/[0.06] pb-3">
              Llaves Activas ({apiKeys.length})
            </h4>

            {loadingKeys ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="text-center py-10 bg-white/[0.003] border border-dashed border-white/[0.06] rounded-2xl">
                <Key className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                <p className="text-xs text-zinc-500">No hay llaves de API activas. Genere una llave de acceso para comenzar.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-white/[0.06] rounded-2xl bg-white/[0.002]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.01] text-zinc-500 font-bold">
                      <th className="p-4 uppercase tracking-wider text-[9px]">Nombre</th>
                      <th className="p-4 uppercase tracking-wider text-[9px]">Prefijo de Acceso</th>
                      <th className="p-4 uppercase tracking-wider text-[9px]">Ámbito</th>
                      <th className="p-4 uppercase tracking-wider text-[9px]">Creada el</th>
                      <th className="p-4 uppercase tracking-wider text-[9px]">Expiración</th>
                      <th className="p-4 text-right uppercase tracking-wider text-[9px]">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {apiKeys.map((key) => (
                      <tr key={key.id} className="hover:bg-white/[0.005] transition-colors text-zinc-300 font-medium">
                        <td className="p-4 text-white font-bold">{key.name}</td>
                        <td className="p-4 font-mono tracking-wider text-cyan-400">{key.keyPrefix}</td>
                        <td className="p-4">
                          <span className="bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/20 font-mono text-[9px]">
                            {key.scope?.join(', ') || 'read, write'}
                          </span>
                        </td>
                        <td className="p-4 text-zinc-500">{new Date(key.createdAt).toLocaleDateString()}</td>
                        <td className="p-4">
                          {key.expiresAt ? (
                            <span className={new Date(key.expiresAt) < new Date() ? 'text-red-400' : 'text-zinc-400'}>
                              {new Date(key.expiresAt).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-zinc-600 italic">Nunca expira</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleRevokeApiKey(key.id)}
                            className="text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 p-2 rounded-lg border border-red-500/20 transition-all cursor-pointer"
                            title="Revocar esta API Key"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Developer Integrations - Webhooks */}
      <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-10 relative overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="mb-12 relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-3">
                <Globe className="w-6 h-6 text-cyan-400" />
                Configuración de Webhooks
              </h2>
              <p className="text-sm text-zinc-500 mt-2">
                Reciba notificaciones HTTP en tiempo real directamente en su servidor cuando ocurran eventos en sus auditorías de red.
              </p>
            </div>
            
            {/* Active Project Selector */}
            {initialProjects.length > 0 && (
              <div className="flex flex-col gap-1.5 min-w-[220px]">
                <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Dominio de Auditoría</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId && setSelectedProjectId(e.target.value)}
                  className="bg-black/60 border border-white/[0.08] focus:border-cyan-500 rounded-xl px-4 py-2.5 text-xs text-white font-bold focus:outline-none transition-all cursor-pointer"
                >
                  {initialProjects.map(proj => (
                    <option key={proj.id} value={proj.id}>{proj.name} ({proj.domain})</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-8 relative z-10">
          {/* Create Webhook Form */}
          {selectedProjectId ? (
            <form onSubmit={handleCreateWebhook} className="bg-white/[0.005] border border-white/[0.06] rounded-2xl p-8 space-y-6">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan-400" /> Registrar Nuevo Destino de Eventos
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Nombre del Destino</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ej: Slack Alert Endpoint" 
                    value={newWebhookName}
                    onChange={(e) => setNewWebhookName(e.target.value)}
                    className="w-full bg-black/60 border border-white/[0.08] focus:border-cyan-500 rounded-xl px-5 py-3 text-sm text-zinc-200 font-bold focus:outline-none transition-all placeholder-zinc-700 focus:shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">URL de Endpoint (Debe ser HTTPS)</label>
                  <input 
                    type="url" 
                    required
                    placeholder="https://api.tuempresa.com/webhooks/alerts" 
                    value={newWebhookUrl}
                    onChange={(e) => setNewWebhookUrl(e.target.value)}
                    className="w-full bg-black/60 border border-white/[0.08] focus:border-cyan-500 rounded-xl px-5 py-3 text-sm text-zinc-200 font-bold focus:outline-none transition-all placeholder-zinc-700 focus:shadow-[0_0_15px_rgba(6,182,212,0.1)] font-mono"
                  />
                </div>
              </div>

              {/* Event Suscription */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Suscripción a Eventos</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex items-start gap-3 p-4 bg-black/40 border border-white/[0.06] rounded-xl hover:bg-black/60 transition-all cursor-pointer">
                    <input
                      type="checkbox"
                      checked={webhookEvents.includes('audit.completed')}
                      onChange={() => handleToggleEvent('audit.completed')}
                      className="mt-0.5 rounded border-zinc-700 text-cyan-500 focus:ring-cyan-500/20 bg-black"
                    />
                    <div>
                      <span className="text-xs font-bold text-white block font-mono">audit.completed</span>
                      <span className="text-[10px] text-zinc-500">Se dispara cada vez que se finaliza un escaneo o auditoría completa en el dominio.</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-4 bg-black/40 border border-white/[0.06] rounded-xl hover:bg-black/60 transition-all cursor-pointer">
                    <input
                      type="checkbox"
                      checked={webhookEvents.includes('alert.triggered')}
                      onChange={() => handleToggleEvent('alert.triggered')}
                      className="mt-0.5 rounded border-zinc-700 text-cyan-500 focus:ring-cyan-500/20 bg-black"
                    />
                    <div>
                      <span className="text-xs font-bold text-white block font-mono">alert.triggered</span>
                      <span className="text-[10px] text-zinc-500">Se dispara cuando ocurre una degradación de latencia o cookies críticas expiran.</span>
                    </div>
                  </label>
                </div>
              </div>

              {webhooksError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{webhooksError}</span>
                </div>
              )}

              <div className="flex justify-between items-center pt-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={webhookActive}
                    onChange={(e) => setWebhookActive(e.target.checked)}
                    className="rounded border-zinc-700 text-cyan-500 focus:ring-cyan-500/20 bg-black"
                  />
                  <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Activo de Inmediato</span>
                </label>

                <button
                  type="submit"
                  disabled={creatingWebhook || !newWebhookName.trim() || !newWebhookUrl.trim() || webhookEvents.length === 0}
                  className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-black px-8 py-3 rounded-xl text-[10px] font-extrabold uppercase tracking-widest shadow-[0_0_20px_rgba(6,182,212,0.2)] transition-all flex items-center gap-2 cursor-pointer"
                >
                  {creatingWebhook ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-black" /> Registrando...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 text-black" /> Registrar Webhook
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="text-center py-10 bg-white/[0.003] border border-dashed border-white/[0.06] rounded-2xl">
              <Info className="w-8 h-8 text-cyan-400 mx-auto mb-3" />
              <p className="text-xs text-zinc-500">Cree y configure un proyecto primero para poder asociar endpoints de webhooks.</p>
            </div>
          )}

          {/* Webhooks Active Targets List */}
          {selectedProjectId && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-white/[0.06] pb-3">
                Destinos Registrados del Proyecto ({webhooks.length})
              </h4>

              {loadingWebhooks ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                </div>
              ) : webhooks.length === 0 ? (
                <div className="text-center py-10 bg-white/[0.003] border border-dashed border-white/[0.06] rounded-2xl">
                  <Globe className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                  <p className="text-xs text-zinc-500">No hay destinos de webhook registrados para este proyecto.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {webhooks.map((wh) => (
                    <div 
                      key={wh.id} 
                      className="bg-white/[0.002] border border-white/[0.06] rounded-2xl p-6 hover:bg-white/[0.008] transition-all flex flex-col md:flex-row md:items-center justify-between gap-6"
                    >
                      <div className="space-y-3 flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-white truncate">{wh.name}</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                            wh.active 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : 'bg-zinc-500/10 text-zinc-500 border-white/[0.04]'
                          }`}>
                            {wh.active ? 'Activo' : 'Pausado'}
                          </span>
                        </div>

                        <div className="font-mono text-xs text-zinc-400 truncate bg-black/30 border border-white/[0.04] px-4 py-2 rounded-xl">
                          {wh.url}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1 text-[9px] font-mono">
                          <span className="text-zinc-500 uppercase font-bold tracking-wider mr-2">Suscrito a:</span>
                          {wh.events.map(ev => (
                            <span key={ev} className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded">
                              {ev}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 justify-end flex-shrink-0">
                        <button
                          onClick={() => handleCopy(wh.secretToken, wh.id)}
                          className="bg-zinc-500/10 hover:bg-zinc-500/20 border border-white/[0.08] hover:border-cyan-500/30 text-zinc-400 hover:text-cyan-400 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                          title="Copiar Secreto de Firma"
                        >
                          {copiedId === wh.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" /> Copiar Firma whsec
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handleDeleteWebhook(wh.id)}
                          className="text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 p-2 rounded-xl border border-red-500/20 transition-all cursor-pointer"
                          title="Eliminar Webhook"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. MODAL: API Key Plaintext Secret Revealed (Once) */}
      {showKeyModal && revealedClearKey && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-zinc-950 border border-white/[0.08] w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl p-8 relative space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-cyan-500/15 border border-cyan-500/30 rounded-full flex items-center justify-center mx-auto text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">¡Llave de API Creada con Éxito!</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Por razones de seguridad, esta credencial solo se mostrará **una vez**. Asegúrese de guardarla de forma segura antes de cerrar esta ventana.
              </p>
            </div>

            <div className="bg-black border border-white/[0.08] rounded-xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Firma Secreta de Acceso</span>
                <button
                  onClick={() => handleCopy(revealedClearKey, 'modal-key')}
                  className="text-cyan-400 hover:text-cyan-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedId === 'modal-key' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> ¡Copiada!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copiar Llave
                    </>
                  )}
                </button>
              </div>

              <div className="font-mono text-sm text-cyan-400 break-all select-all font-semibold select-none bg-zinc-950 p-4 border border-white/[0.04] rounded-lg text-center tracking-wide">
                {revealedClearKey}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  setShowKeyModal(false);
                  setRevealedClearKey(null);
                }}
                className="bg-zinc-100 hover:bg-white text-black font-extrabold text-[10px] uppercase tracking-widest px-8 py-3.5 rounded-xl shadow-[0_4px_12px_rgba(255,255,255,0.1)] transition-all cursor-pointer"
              >
                He Guardado la Llave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL: Webhook Signing Secret Revealed (Once) */}
      {showWebhookModal && revealedWebhookSecret && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-zinc-950 border border-white/[0.08] w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl p-8 relative space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-cyan-500/15 border border-cyan-500/30 rounded-full flex items-center justify-center mx-auto text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">¡Webhook Registrado con Éxito!</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Utilice este secreto de firma para validar de forma criptográfica la autenticidad e integridad de los payloads de eventos entrantes (`alert.triggered`, `audit.completed`).
              </p>
            </div>

            <div className="bg-black border border-white/[0.08] rounded-xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Secret Token de Firma (signing secret)</span>
                <button
                  onClick={() => handleCopy(revealedWebhookSecret, 'modal-webhook')}
                  className="text-cyan-400 hover:text-cyan-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedId === 'modal-webhook' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> ¡Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copiar Secreto
                    </>
                  )}
                </button>
              </div>

              <div className="font-mono text-sm text-cyan-400 break-all select-all font-semibold select-none bg-zinc-950 p-4 border border-white/[0.04] rounded-lg text-center tracking-wide">
                {revealedWebhookSecret}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  setShowWebhookModal(false);
                  setRevealedWebhookSecret(null);
                }}
                className="bg-zinc-100 hover:bg-white text-black font-extrabold text-[10px] uppercase tracking-widest px-8 py-3.5 rounded-xl shadow-[0_4px_12px_rgba(255,255,255,0.1)] transition-all cursor-pointer"
              >
                He Guardado el Secreto
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
