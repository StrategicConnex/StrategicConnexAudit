'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
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
  Info,
  Search,
  ArrowUpDown,
  Clock,
  BarChart3
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
  /**
   * VULN-002 fix: GET /api/webhooks ya NO devuelve el secreto de firma.
   * Solo un preview enmascarado (primeros 8 chars). El secreto completo se
   * muestra UNA sola vez en el modal de creación (respuesta del POST).
   */
  secretTokenPreview?: string | null;
  events: string[];
  active: boolean;
  createdAt: string;
}

export function SettingsTab({ 
  initialProjects = [], 
  selectedProjectId = '', 
  setSelectedProjectId 
}: SettingsTabProps) {
  const t = useTranslations('settings');

  // Global agency branding settings (localStorage)
  const [agencyName, setAgencyName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('oklch(68% 0.14 230)');
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

  // API Keys filters
  const [keySearch, setKeySearch] = useState('');
  const [showExpiringSoon, setShowExpiringSoon] = useState(false);
  const [sortNewestFirst, setSortNewestFirst] = useState(true);

  // Frozen "now" for expiry math - Date.now() during render is impure
  const [now] = useState(() => Date.now());

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
          setPrimaryColor(parsed.color || 'oklch(68% 0.14 230)');
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
      alert(t('brandingSaveSuccess'));
    }
  };

  // Fetch API Keys
  const fetchApiKeys = useCallback(async () => {
    setLoadingKeys(true);
    setKeysError(null);
    try {
      const res = await fetch('/api/api-keys');
      const data = await res.json();
      if (data.success) {
        setApiKeys(data.keys || []);
      } else {
        setKeysError(data.error || t('apiKeysFetchNetworkError'));
      }
    } catch (err: any) {
      setKeysError(err.message || t('apiKeysFetchNetworkError'));
    } finally {
      setLoadingKeys(false);
    }
  }, [t]);

  // Fetch Webhooks for current Project
  const fetchWebhooks = useCallback(async (projId: string) => {
    if (!projId) return;
    setLoadingWebhooks(true);
    setWebhooksError(null);
    try {
      const res = await fetch(`/api/webhooks?projectId=${projId}`);
      const data = await res.json();
      if (data.success) {
        setWebhooks(data.webhooks || []);
      } else {
        setWebhooksError(data.error || t('webhooksFetchNetworkError'));
      }
    } catch (err: any) {
      setWebhooksError(err.message || t('webhooksFetchNetworkError'));
    } finally {
      setLoadingWebhooks(false);
    }
  }, [t]);

  // Initial loads
  useEffect(() => {
    fetchApiKeys();
  }, [fetchApiKeys]);

  useEffect(() => {
    if (selectedProjectId) {
      fetchWebhooks(selectedProjectId);
    }
  }, [selectedProjectId, fetchWebhooks]);

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
          scope: [],
          expiresAt: expiresDays > 0
            ? new Date(Date.now() + expiresDays * 86400000).toISOString()
            : undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        setRevealedClearKey(data.rawKey);
        setShowKeyModal(true);
        setNewKeyName('');
        setExpiresDays(0);
        fetchApiKeys(); // reload
      } else {
        setKeysError(data.error || t('apiKeysCreateNetworkError'));
      }
    } catch (err: any) {
      setKeysError(err.message || t('apiKeysCreateNetworkError'));
    } finally {
      setCreatingKey(false);
    }
  };

  // Revoke API Key
  const handleRevokeApiKey = async (id: string) => {
    if (!confirm(t('apiKeysRevokeConfirm'))) {
      return;
    }
    try {
      const res = await fetch(`/api/api-keys?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchApiKeys();
      } else {
        alert(t('apiKeysRevokeError', { error: data.error }));
      }
    } catch (err: any) {
      alert(t('apiKeysRevokeNetworkError', { error: err.message }));
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
        setWebhooksError(data.error || t('webhooksCreateNetworkError'));
      }
    } catch (err: any) {
      setWebhooksError(err.message || t('webhooksCreateNetworkError'));
    } finally {
      setCreatingWebhook(false);
    }
  };

  // Delete Webhook
  const handleDeleteWebhook = async (id: string) => {
    if (!confirm(t('webhooksDeleteConfirm'))) {
      return;
    }
    try {
      const res = await fetch(`/api/webhooks?id=${id}&projectId=${selectedProjectId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchWebhooks(selectedProjectId);
      } else {
        alert(t('webhooksDeleteError', { error: data.error }));
      }
    } catch (err: any) {
      alert(t('webhooksDeleteNetworkError', { error: err.message }));
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

  // Compute filtered + sorted API Keys for display
  const visibleKeys = apiKeys
    .filter((key) => {
      if (keySearch.trim()) {
        const q = keySearch.toLowerCase();
        if (!key.name.toLowerCase().includes(q)) return false;
      }
      if (showExpiringSoon) {
        if (!key.expiresAt) return false;
        const days = (new Date(key.expiresAt).getTime() - now) / 86400000;
        if (days > 7 || days < 0) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return sortNewestFirst ? bTime - aTime : aTime - bTime;
    });

  // Helper: render expiry badge with days remaining
  function renderExpiryBadge(expiresAt: string | null) {
    if (!expiresAt) return null;
    const days = (new Date(expiresAt).getTime() - now) / 86400000;
    if (days <= 7 && days >= 0) {
      return (
        <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
          {Math.ceil(days)}d
        </span>
      );
    }
    return null;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl font-sans text-foreground relative z-10 space-y-10">
      
      {/* 1. Main System Settings Card */}
      <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl p-10 relative overflow-hidden ">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="mb-12 relative z-10">
          <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <Settings className="w-6 h-6 text-primary" />
            {t('pageTitle')}
          </h2>
          <p className="text-sm text-muted-fg mt-2">{t('pageSubtitle')}</p>
        </div>

        <div className="space-y-12 relative z-10">
          {/* IA integrations */}
          <div className="space-y-6">
            <h3 className="text-[10px] font-bold text-muted-fg uppercase tracking-widest border-b border-border pb-3">{t('sectionAi')}</h3>
            <div className="bg-muted/1 border border-border rounded-2xl p-8 hover:bg-muted/5 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[15px] font-bold text-white tracking-tight">{t('aiGatewayLabel')}</span>
                <span className="text-[9px] font-bold bg-chartreuse/10 text-chartreuse px-3 py-1 rounded-full border border-chartreuse/20 uppercase tracking-wider">{t('aiGatewayBadge')}</span>
              </div>
              <p className="text-xs text-muted-fg mb-6 leading-relaxed">{t('aiGatewayDesc')}</p>
              <input 
                type="password" 
                value="************************************************" 
                readOnly 
                className="w-full bg-card border border-border rounded-xl px-6 py-3.5 text-xs text-muted-fg focus:outline-none font-mono tracking-wider" 
              />
            </div>
          </div>

          {/* White label settings */}
          <div className="space-y-6">
            <h3 className="text-[10px] font-bold text-muted-fg uppercase tracking-widest border-b border-border pb-3 flex items-center gap-2">
              <Palette className="w-4 h-4 text-primary" /> {t('sectionBranding')}
            </h3>
            <div className="bg-muted/1 border border-border rounded-2xl p-8 hover:bg-muted/5 transition-colors">
              <p className="text-xs text-muted-fg mb-10 leading-relaxed">{t('brandingDesc')}</p>
              
              <div className="grid gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-muted-fg uppercase tracking-widest">{t('brandingNameLabel')}</label>
                  <input 
                    type="text" 
                    placeholder={t('brandingNamePlaceholder')} 
                    className="w-full bg-card border border-border focus:border-primary rounded-xl px-6 py-3.5 text-sm text-foreground/80 font-bold focus:outline-none transition-[color,background-color,border-color,box-shadow] placeholder-zinc-700 focus:shadow-[0_0_15px_rgba(98,113,196,0.15)]"
                    id="branding-name-input"
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-muted-fg uppercase tracking-widest">{t('brandingColorLabel')}</label>
                    <div className="flex gap-4 items-center">
                      <input 
                        type="color" 
                        className="w-12 h-12 rounded-full border-2 border-border bg-transparent p-0 cursor-pointer overflow-hidden"
                        id="branding-color-picker"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                      />
                      <input 
                        type="text" 
                        id="branding-color-text"
                        placeholder={t('brandingColorPlaceholder')} 
                        className="flex-1 bg-card border border-border focus:border-primary rounded-xl px-6 py-3.5 text-sm font-bold text-foreground/80 focus:outline-none transition-colors uppercase placeholder-zinc-700"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-muted-fg uppercase tracking-widest">{t('brandingLogoLabel')}</label>
                    <input 
                      type="text" 
                      placeholder={t('brandingLogoPlaceholder')} 
                      className="w-full bg-card border border-border focus:border-primary rounded-xl px-6 py-3.5 text-sm text-foreground/80 font-bold focus:outline-none transition-[color,background-color,border-color,box-shadow] placeholder-zinc-700 focus:shadow-[0_0_15px_rgba(98,113,196,0.15)]"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              
              <div className="mt-12 flex justify-end">
                <button 
                  onClick={handleSaveBranding}
                  className="bg-cyan-500 hover:bg-cyan-400 text-black px-10 py-3.5 rounded-xl text-[11px] font-extrabold uppercase tracking-widest shadow-[0_0_20px_rgba(98,113,196,0.3)] hover:shadow-[0_0_25px_rgba(98,113,196,0.45)] transition-[color,background-color,box-shadow] flex items-center gap-3 group cursor-pointer"
                >
                  <Save className="w-4 h-4 group-hover:scale-110 transition-transform text-black" /> {t('brandingSaveButton')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Developer Integrations - API Keys */}
      <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl p-10 relative overflow-hidden ">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="mb-12 relative z-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-3">
                <Key className="w-6 h-6 text-primary" />
                {t('apiKeysTitle')}
              </h2>
              <p className="text-sm text-muted-fg mt-2">
                {t('apiKeysDesc')}
              </p>
            </div>
            <a
              href="/settings/api-keys"
              className="shrink-0 bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl text-[10px] font-extrabold uppercase tracking-widest shadow-[0_0_20px_rgba(99,102,241,0.2)] transition-[color,background-color,box-shadow] flex items-center gap-2 cursor-pointer"
            >
              <BarChart3 className="w-4 h-4" /> {t('apiKeysDashboardButton')}
            </a>
          </div>
        </div>

        <div className="space-y-8 relative z-10">
          {/* Create Key Form */}
          <form onSubmit={handleCreateApiKey} className="bg-muted/1 border border-border rounded-2xl p-8 space-y-6">
            <h4 className="text-xs font-bold text-muted-fg uppercase tracking-widest flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" /> {t('apiKeysCreateTitle')}
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-bold text-muted-fg uppercase tracking-widest">{t('apiKeysNameLabel')}</label>
                <input 
                  type="text" 
                  required
                  placeholder={t('apiKeysNamePlaceholder')} 
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full bg-card border border-border focus:border-primary rounded-xl px-5 py-3 text-sm text-foreground/80 font-bold focus:outline-none transition-[color,background-color,border-color,box-shadow] placeholder-zinc-700 focus:shadow-[0_0_15px_rgba(98,113,196,0.15)]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-fg uppercase tracking-widest">{t('apiKeysExpiryLabel')}</label>
                <select
                  value={expiresDays}
                  onChange={(e) => setExpiresDays(Number(e.target.value))}
                  className="w-full bg-card border border-border focus:border-primary rounded-xl px-5 py-3 text-sm text-muted-fg font-bold focus:outline-none transition-[color,background-color,border-color,box-shadow] focus:shadow-[0_0_15px_rgba(98,113,196,0.15)]"
                >
                  <option value={0}>{t('apiKeysExpiryNever')}</option>
                  <option value={30}>{t('apiKeysExpiry30')}</option>
                  <option value={90}>{t('apiKeysExpiry90')}</option>
                  <option value={365}>{t('apiKeysExpiry365')}</option>
                </select>
              </div>
            </div>

            {keysError && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{keysError}</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={creatingKey || !newKeyName.trim()}
                className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-black px-8 py-3 rounded-xl text-[10px] font-extrabold uppercase tracking-widest shadow-[0_0_20px_rgba(98,113,196,0.2)] transition-[color,background-color,opacity,box-shadow] flex items-center gap-2 cursor-pointer"
              >
                {creatingKey ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" /> {t('apiKeysGenerating')}
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 text-black" /> {t('apiKeysGenerateButton')}
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Active Keys List */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-muted-fg uppercase tracking-widest border-b border-border pb-3">
              {t('apiKeysCount', { count: apiKeys.length })}
            </h4>

            {loadingKeys ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="text-center py-10 bg-muted/1 border border-dashed border-border rounded-2xl">
                <Key className="w-8 h-8 text-muted-fg mx-auto mb-3" />
                <p className="text-xs text-muted-fg">{t('apiKeysEmpty')}</p>
              </div>
            ) : (
              <>
                {/* Filters bar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-fg" />
                    <input
                      type="text"
                      placeholder={t('apiKeysSearchPlaceholder')}
                      value={keySearch}
                      onChange={(e) => setKeySearch(e.target.value)}
                      className="w-full bg-card border border-border focus:border-primary rounded-xl pl-10 pr-4 py-2.5 text-xs text-foreground/80 font-medium focus:outline-none transition-colors placeholder-zinc-600"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showExpiringSoon}
                        onChange={(e) => setShowExpiringSoon(e.target.checked)}
                        className="rounded border-zinc-700 text-primary focus:ring-cyan-500/20 bg-black"
                      />
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[10px] font-bold text-muted-fg uppercase tracking-wider">{t('apiKeysFilterExpiringSoon')}</span>
                    </label>
                    <button
                      onClick={() => setSortNewestFirst(!sortNewestFirst)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-border text-muted-fg hover:text-primary hover:border-primary/30 bg-card transition-colors cursor-pointer"
                    >
                      <ArrowUpDown className="w-3.5 h-3.5" />
                      {sortNewestFirst ? t('apiKeysSortNewest') : t('apiKeysSortOldest')}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto border border-border rounded-2xl bg-muted/1">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/5 text-muted-fg font-bold">
                        <th className="p-4 uppercase tracking-wider text-[9px]">{t('apiKeysColName')}</th>
                        <th className="p-4 uppercase tracking-wider text-[9px]">{t('apiKeysColPrefix')}</th>
                        <th className="p-4 uppercase tracking-wider text-[9px]">{t('apiKeysColScope')}</th>
                        <th
                          className="p-4 uppercase tracking-wider text-[9px] cursor-pointer hover:text-primary transition-colors select-none"
                          onClick={() => setSortNewestFirst(!sortNewestFirst)}
                        >                            <span className="flex items-center gap-1">
                              {t('apiKeysColCreated')}
                              <ArrowUpDown className="w-3 h-3" />
                            </span>
                        </th>
                        <th className="p-4 uppercase tracking-wider text-[9px]">{t('apiKeysColExpiry')}</th>
                        <th className="p-4 text-right uppercase tracking-wider text-[9px]">{t('apiKeysColAction')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {visibleKeys.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-xs text-muted-fg">
                            <Key className="w-5 h-5 mx-auto mb-2 opacity-40" />
                            {t('apiKeysNoResults')}
                          </td>
                        </tr>
                      ) : (
                        visibleKeys.map((key) => (
                          <tr key={key.id} className="hover:bg-muted/1 transition-colors text-foreground/80 font-medium">
                            <td className="p-4 text-white font-bold flex items-center gap-2">
                              {key.name}
                              {renderExpiryBadge(key.expiresAt)}
                            </td>
                            <td className="p-4 font-mono tracking-wider text-primary">{key.keyPrefix}</td>
                            <td className="p-4">
                              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20 font-mono text-[9px]">
                                {key.scope?.join(', ') || 'read, write'}
                              </span>
                            </td>
                            <td className="p-4 text-muted-fg">{new Date(key.createdAt).toLocaleDateString()}</td>
                            <td className="p-4">
                              {key.expiresAt ? (
                                <span className={new Date(key.expiresAt) < new Date() ? 'text-destructive' : 'text-muted-fg'}>
                                  {new Date(key.expiresAt).toLocaleDateString()}
                                </span>
                              ) : (
                                <span className="text-muted-fg italic">{t('apiKeysNeverExpires')}</span>
                              )}
                            </td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() => handleRevokeApiKey(key.id)}
                                className="text-destructive hover:text-red-300 bg-destructive/10 hover:bg-red-500/20 p-2 rounded-lg border border-destructive/20 transition-colors cursor-pointer"
                                title={t('apiKeysRevokeTitle')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        )))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 3. Developer Integrations - Webhooks */}
      <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl p-10 relative overflow-hidden ">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="mb-12 relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-3">
                <Globe className="w-6 h-6 text-primary" />
                {t('webhooksTitle')}
              </h2>
              <p className="text-sm text-muted-fg mt-2">
                {t('webhooksDesc')}
              </p>
            </div>
            
            {/* Active Project Selector */}
            {initialProjects.length > 0 && (
              <div className="flex flex-col gap-1.5 min-w-[220px]">
                <label className="text-[9px] font-bold text-muted-fg uppercase tracking-widest">{t('webhooksProjectLabel')}</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId && setSelectedProjectId(e.target.value)}
                  className="bg-card border border-border focus:border-primary rounded-xl px-4 py-2.5 text-xs text-white font-bold focus:outline-none transition-colors cursor-pointer"
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
            <form onSubmit={handleCreateWebhook} className="bg-muted/1 border border-border rounded-2xl p-8 space-y-6">
              <h4 className="text-xs font-bold text-muted-fg uppercase tracking-widest flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" /> {t('webhooksCreateTitle')}
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-fg uppercase tracking-widest">{t('webhooksNameLabel')}</label>
                  <input 
                    type="text" 
                    required
                    placeholder={t('webhooksNamePlaceholder')} 
                    value={newWebhookName}
                    onChange={(e) => setNewWebhookName(e.target.value)}
                    className="w-full bg-card border border-border focus:border-primary rounded-xl px-5 py-3 text-sm text-foreground/80 font-bold focus:outline-none transition-[color,background-color,border-color,box-shadow] placeholder-zinc-700 focus:shadow-[0_0_15px_rgba(98,113,196,0.15)]"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-fg uppercase tracking-widest">{t('webhooksUrlLabel')}</label>
                  <input 
                    type="url" 
                    required
                    placeholder={t('webhooksUrlPlaceholder')} 
                    value={newWebhookUrl}
                    onChange={(e) => setNewWebhookUrl(e.target.value)}
                    className="w-full bg-card border border-border focus:border-primary rounded-xl px-5 py-3 text-sm text-foreground/80 font-bold focus:outline-none transition-[color,background-color,border-color,box-shadow] placeholder-zinc-700 focus:shadow-[0_0_15px_rgba(98,113,196,0.15)] font-mono"
                  />
                </div>
              </div>

              {/* Event Suscription */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-muted-fg uppercase tracking-widest block">{t('webhooksEventsLabel')}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex items-start gap-3 p-4 bg-card border border-border rounded-xl hover:bg-card transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={webhookEvents.includes('audit.completed')}
                      onChange={() => handleToggleEvent('audit.completed')}
                      className="mt-0.5 rounded border-zinc-700 text-primary focus:ring-cyan-500/20 bg-black"
                    />
                    <div>
                      <span className="text-xs font-bold text-white block font-mono">audit.completed</span>
                      <span className="text-[10px] text-muted-fg">{t('webhooksEventAuditDesc')}</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-4 bg-card border border-border rounded-xl hover:bg-card transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={webhookEvents.includes('alert.triggered')}
                      onChange={() => handleToggleEvent('alert.triggered')}
                      className="mt-0.5 rounded border-zinc-700 text-primary focus:ring-cyan-500/20 bg-black"
                    />
                    <div>
                      <span className="text-xs font-bold text-white block font-mono">alert.triggered</span>
                      <span className="text-[10px] text-muted-fg">{t('webhooksEventAlertDesc')}</span>
                    </div>
                  </label>
                </div>
              </div>

              {webhooksError && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
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
                    className="rounded border-zinc-700 text-primary focus:ring-cyan-500/20 bg-black"
                  />
                  <span className="text-xs text-muted-fg font-bold uppercase tracking-wider">{t('webhooksActiveLabel')}</span>
                </label>

                <button
                  type="submit"
                  disabled={creatingWebhook || !newWebhookName.trim() || !newWebhookUrl.trim() || webhookEvents.length === 0}
                  className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-black px-8 py-3 rounded-xl text-[10px] font-extrabold uppercase tracking-widest shadow-[0_0_20px_rgba(98,113,196,0.2)] transition-[color,background-color,opacity,box-shadow] flex items-center gap-2 cursor-pointer"
                >
                  {creatingWebhook ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-black" /> {t('webhooksRegistering')}
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 text-black" /> {t('webhooksRegisterButton')}
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="text-center py-10 bg-muted/1 border border-dashed border-border rounded-2xl">
              <Info className="w-8 h-8 text-primary mx-auto mb-3" />
              <p className="text-xs text-muted-fg">{t('webhooksNoProject')}</p>
            </div>
          )}

          {/* Webhooks Active Targets List */}
          {selectedProjectId && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-muted-fg uppercase tracking-widest border-b border-border pb-3">
                {t('webhooksCount', { count: webhooks.length })}
              </h4>

              {loadingWebhooks ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : webhooks.length === 0 ? (
                <div className="text-center py-10 bg-muted/1 border border-dashed border-border rounded-2xl">
                  <Globe className="w-8 h-8 text-muted-fg mx-auto mb-3" />
                  <p className="text-xs text-muted-fg">{t('webhooksEmpty')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {webhooks.map((wh) => (
                    <div 
                      key={wh.id} 
                      className="bg-muted/1 border border-border rounded-2xl p-6 hover:bg-muted/1 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-6"
                    >
                      <div className="space-y-3 flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-white truncate">{wh.name}</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                            wh.active 
                              ? 'bg-chartreuse/10 text-chartreuse border-chartreuse/20' 
                              : 'bg-zinc-500/10 text-muted-fg border-border/50'
                          }`}>
                            {wh.active ? t('webhooksActiveBadge') : t('webhooksPausedBadge')}
                          </span>
                        </div>

                        <div className="font-mono text-xs text-muted-fg truncate bg-card border border-border/50 px-4 py-2 rounded-xl">
                          {wh.url}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1 text-[9px] font-mono">
                          <span className="text-muted-fg uppercase font-bold tracking-wider mr-2">{t('webhooksSubscribedTo')}</span>
                          {wh.events.map(ev => (
                            <span key={ev} className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded">
                              {ev}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 justify-end flex-shrink-0">
                        {/* VULN-002 fix: el secreto de firma ya no se re-expone desde el
                            listado ni se ofrece copiarlo (solo un preview enmascarado).
                            Se muestra completo UNA sola vez al crear el webhook (modal POST). */}
                        {wh.secretTokenPreview && (
                          <span
                            className="bg-zinc-500/10 border border-border text-muted-fg px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider"
                            title={t('webhooksSecretMasked')}
                          >
                            {wh.secretTokenPreview}
                          </span>
                        )}

                        <button
                          onClick={() => handleDeleteWebhook(wh.id)}
                          className="text-destructive hover:text-red-300 bg-destructive/10 hover:bg-red-500/20 p-2 rounded-xl border border-destructive/20 transition-colors cursor-pointer"
                          title={t('webhooksDeleteTitle')}
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
          <div className="bg-card border border-border w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl p-8 relative space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-primary/15 border border-primary/30 rounded-full flex items-center justify-center mx-auto text-primary shadow-[0_0_15px_rgba(98,113,196,0.1)]">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">{t('apiKeysModalTitle')}</h3>
              <p className="text-xs text-muted-fg leading-relaxed">
                {t('apiKeysModalDesc')}
              </p>
            </div>

            <div className="bg-black border border-border rounded-xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold text-muted-fg uppercase tracking-widest">{t('apiKeysModalSecretLabel')}</span>
                <button
                  onClick={() => handleCopy(revealedClearKey, 'modal-key')}
                  className="text-primary hover:text-primary/80 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedId === 'modal-key' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-chartreuse" /> {t('apiKeysModalCopied')}
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> {t('apiKeysModalCopy')}
                    </>
                  )}
                </button>
              </div>

              <div className="font-mono text-sm text-primary break-all select-all font-semibold select-none bg-card p-4 border border-border/50 rounded-lg text-center tracking-wide">
                {revealedClearKey}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  setShowKeyModal(false);
                  setRevealedClearKey(null);
                }}
                className="bg-zinc-100 hover:bg-white text-black font-extrabold text-[10px] uppercase tracking-widest px-8 py-3.5 rounded-xl shadow-[0_4px_12px_rgba(255,255,255,0.1)] transition-[color,background-color,box-shadow] cursor-pointer"
              >
                {t('apiKeysModalButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL: Webhook Signing Secret Revealed (Once) */}
      {showWebhookModal && revealedWebhookSecret && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-card border border-border w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl p-8 relative space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-primary/15 border border-primary/30 rounded-full flex items-center justify-center mx-auto text-primary shadow-[0_0_15px_rgba(98,113,196,0.1)]">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">{t('webhooksModalTitle')}</h3>
              <p className="text-xs text-muted-fg leading-relaxed">
                {t('webhooksModalDesc')}
              </p>
            </div>

            <div className="bg-black border border-border rounded-xl p-5 space-y-4">
              {/* VULN-002 fix: sin botón de copiar — el secreto solo se muestra una
                  vez (creación) para minimizar la superficie de exposición. */}
              <span className="text-[9px] font-bold text-muted-fg uppercase tracking-widest">{t('webhooksModalSecretLabel')}</span>

              {/* Sin botón de copiar (VULN-002), el texto queda SELECCIONABLE a mano:
                  select-all sin select-none para que el usuario pueda guardarlo. */}
              <div className="font-mono text-sm text-primary break-all select-all font-semibold bg-card p-4 border border-border/50 rounded-lg text-center tracking-wide">
                {revealedWebhookSecret}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  setShowWebhookModal(false);
                  setRevealedWebhookSecret(null);
                }}
                className="bg-zinc-100 hover:bg-white text-black font-extrabold text-[10px] uppercase tracking-widest px-8 py-3.5 rounded-xl shadow-[0_4px_12px_rgba(255,255,255,0.1)] transition-[color,background-color,box-shadow] cursor-pointer"
              >
                {t('webhooksModalButton')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
