'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Package, Download, Check, Trash2, Search, Loader2,
  Shield, Globe, Server, Mail, AlertTriangle, Zap,
  Star, Tag, X
} from 'lucide-react';

interface PluginPackage {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  category: string;
  tags: string[];
  downloadsCount: number;
  rating: string;
  riskLevel: string;
  isOfficial: boolean;
  iconUrl: string | null;
  homepage: string | null;
}

interface PluginInstance {
  id: string;
  packageId: string;
  enabled: boolean;
  createdAt: string;
}

interface MarketplacePlugin {
  pkg: PluginPackage;
  instance: PluginInstance | null;
  installed: boolean;
  compatible: boolean;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  dns: <Globe className="w-4 h-4" />,
  network: <Server className="w-4 h-4" />,
  website: <Zap className="w-4 h-4" />,
  threat: <Shield className="w-4 h-4" />,
  osint: <Search className="w-4 h-4" />,
  email: <Mail className="w-4 h-4" />,
  compliance: <AlertTriangle className="w-4 h-4" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  dns: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  network: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  website: 'bg-chartreuse/10 text-chartreuse border-chartreuse/20',
  threat: 'bg-destructive/10 text-destructive border-destructive/20',
  osint: 'bg-primary/10 text-primary border-primary/20',
  email: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  compliance: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

export function MarketplaceTab() {
  const [plugins, setPlugins] = useState<MarketplacePlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/plugins?view=catalog');
      const data = await res.json();
      if (data.success) {
        setPlugins(data.plugins);
      } else {
        setError(data.error || 'Error al cargar plugins');
      }
    } catch (err: unknown) {
      setError('Error de conexion: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  const handleInstall = async (packageId: string) => {
    setInstallingId(packageId);
    setSuccessMsg(null);
    setError(null);
    try {
      const res = await fetch('/api/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'install', packageId }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg('Plugin instalado correctamente');
        fetchPlugins();
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setError(data.error || 'Error al instalar');
      }
    } catch (err: unknown) {
      setError('Error de conexion: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setInstallingId(null);
    }
  };

  const handleUninstall = async (instanceId: string, packageId: string) => {
    setInstallingId(packageId);
    setSuccessMsg(null);
    setError(null);
    try {
      const res = await fetch('/api/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'uninstall', packageId, instanceId }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg('Plugin desinstalado');
        fetchPlugins();
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setError(data.error || 'Error al desinstalar');
      }
    } catch (err: unknown) {
      setError('Error de conexion: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setInstallingId(null);
    }
  };

  const categories = [...new Set(plugins.map((p) => p.pkg.category))].sort();

  const filtered = plugins.filter((p) => {
    const matchesSearch = search === '' ||
      p.pkg.name.toLowerCase().includes(search.toLowerCase()) ||
      p.pkg.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || p.pkg.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <span className="ml-3 text-sm text-muted-fg">Cargando marketplace de plugins...</span>
      </div>
    );
  }

  const renderPluginCard = (item: MarketplacePlugin) => {
    const pkg = item.pkg;
    const catColor = CATEGORY_COLORS[pkg.category] || 'bg-muted/10 text-muted-fg border-border/50';
    const isInstalling = installingId === pkg.id;

    return (
      <div key={pkg.id}
        className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl p-6 transition-all duration-300 hover:border-primary/15 hover:bg-muted/10 flex flex-col">

        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted/10 border border-border/50 flex items-center justify-center text-foreground/60">
              {CATEGORY_ICONS[pkg.category] || <Package className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">{pkg.name}</h3>
              <span className="text-[10px] text-muted-fg">{pkg.author}</span>
            </div>
          </div>
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${catColor}`}>
            {pkg.category}
          </span>
        </div>

        <p className="text-[11px] text-muted-fg leading-relaxed flex-1 mb-4">
          {pkg.description}
        </p>

        {pkg.tags && pkg.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {pkg.tags.slice(0, 4).map((tag, i) => (
              <span key={i} className="text-[8px] font-bold bg-muted/10 border border-border/30 px-1.5 py-0.5 rounded text-muted-fg uppercase tracking-wider">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-[10px] text-muted-fg border-t border-border/30 pt-3 mb-3">
          <span>v{pkg.version}</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Download className="w-3 h-3" />
              {pkg.downloadsCount}
            </span>
            {Number(pkg.rating) > 0 && (
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3 text-amber-400" />
                {pkg.rating}
              </span>
            )}
            {pkg.isOfficial && (
              <span className="text-[8px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Oficial
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {item.installed && item.instance ? (
            <>
              <span className="flex items-center gap-1.5 text-[10px] text-chartreuse font-bold bg-chartreuse/10 border border-chartreuse/20 px-3 py-1.5 rounded-lg">
                <Check className="w-3 h-3" /> Instalado
              </span>
              <button
                onClick={() => handleUninstall(item.instance!.id, pkg.id)}
                disabled={isInstalling}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[10px] font-bold hover:bg-destructive/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {isInstalling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Desinstalar
              </button>
            </>
          ) : (
            <button
              onClick={() => handleInstall(pkg.id)}
              disabled={isInstalling}
              className="flex items-center gap-2 bg-foreground text-background hover:bg-foreground/80 transition-all font-bold text-xs uppercase tracking-widest px-5 py-2.5 rounded-xl border border-border cursor-pointer active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed w-full justify-center"
            >
              {isInstalling ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Instalando...</>
              ) : (
                <><Download className="w-3.5 h-3.5" /> Instalar</>
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      <div className="backdrop-blur-xl border border-border bg-muted/5 rounded-2xl p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-foreground tracking-tight flex items-center gap-3">
              <Package className="w-6 h-6 text-primary" />
              Plugin Marketplace
            </h2>
            <p className="text-xs text-muted-fg mt-1 max-w-2xl">
              Extiende las capacidades de SCAUDIT con plugins desarrollados por la comunidad
              y el equipo oficial. Cada plugin anade nuevas herramientas de inteligencia,
              analisis y automatizacion.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-muted/10 border border-border/50 px-4 py-2 rounded-xl">
            <Package className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">{plugins.length}</span>
            <span className="text-[9px] text-muted-fg uppercase tracking-wider">Plugins</span>
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl border border-chartreuse/20 bg-chartreuse/10 text-chartreuse text-xs font-bold flex items-center gap-3">
          <Check className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs font-bold flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-fg" />
          <input
            type="text"
            placeholder="Buscar plugins..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-muted/5 border border-border rounded-xl pl-10 pr-4 py-2.5 text-xs font-medium text-foreground placeholder:text-muted-fg/50 focus:outline-none focus:border-primary/40 transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-fg hover:text-foreground cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setCategoryFilter('all')}
            className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
              categoryFilter === 'all' ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-muted/5 border-border text-muted-fg hover:text-foreground'
            }`}>
            Todos ({plugins.length})
          </button>
          {categories.map((cat) => (
            <button key={cat} onClick={() => setCategoryFilter(cat)}
              className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                categoryFilter === cat ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-muted/5 border-border text-muted-fg hover:text-foreground'
              }`}>
              {CATEGORY_ICONS[cat] || <Tag className="w-3 h-3" />}
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-16">
            <Package className="w-12 h-12 text-muted-fg/30 mx-auto mb-4" />
            <p className="text-sm text-muted-fg">No se encontraron plugins con estos filtros</p>
          </div>
        )}

        {filtered.map((item) => renderPluginCard(item))}
      </div>
    </div>
  );
}
