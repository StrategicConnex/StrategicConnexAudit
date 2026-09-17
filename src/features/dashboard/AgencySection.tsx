'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Palette, Link2, Code2, Check, Copy } from 'lucide-react';
import { updateProjectBranding, createPortalLink } from '@/app/actions/projects';

/**
 * AgencySection — marca blanca + portal cliente (B-4).
 * Solo owner/admin ven el formulario (el servidor lo exige de nuevo).
 */
export function AgencySection({ projectId }: { projectId: string }) {
  const t = useTranslations('settings');
  const [brandName, setBrandName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#D4A843');
  const [canEdit, setCanEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    return fetch(`/api/projects/${projectId}/branding`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (data.success) {
          const b = data.branding ?? {};
          if (b.brandName) setBrandName(String(b.brandName));
          if (b.logoUrl) setLogoUrl(String(b.logoUrl));
          if (b.primaryColor) setPrimaryColor(String(b.primaryColor));
          setCanEdit(data.myRole === 'owner' || data.myRole === 'admin');
        }
      })
      .catch(() => {});
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await updateProjectBranding({ projectId, brandName, logoUrl, primaryColor });
      if (result.data?.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.error || result.data?.error || 'Error al guardar');
      }
    } catch {
      setError('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    setGenerating(true);
    setError('');
    try {
      const result = await createPortalLink({ projectId });
      if (result.data?.url) setPortalUrl(result.data.url);
      else setError(result.error || result.data?.error || 'Error al generar el link');
    } catch {
      setError('Error al generar el link');
    } finally {
      setGenerating(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin clipboard API: el usuario selecciona a mano.
    }
  };

  const embed = portalUrl
    ? `<iframe src="${portalUrl}" width="100%" height="640" style="border:0;border-radius:12px" loading="lazy"></iframe>`
    : null;

  return (
    <div className="glass-card p-10 relative overflow-hidden">
      <div className="mb-8">
        <h2 className="text-2xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
          <Palette className="w-6 h-6 text-primary" />
          {t('agencyTitle')}
        </h2>
        <p className="text-sm text-muted-fg mt-2">{t('agencyDesc')}</p>
      </div>

      {canEdit ? (
        <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="space-y-2">
            <label className="text-2xs text-muted-fg font-bold uppercase tracking-widest">{t('agencyBrandName')}</label>
            <input
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder={t('agencyBrandPlaceholder')}
              maxLength={60}
              className="w-full bg-card border border-border focus:border-primary rounded-xl px-5 py-3 text-sm text-foreground/80 font-bold focus:outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-2xs text-muted-fg font-bold uppercase tracking-widest">{t('agencyLogo')}</label>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…/logo.png"
              className="w-full bg-card border border-border focus:border-primary rounded-xl px-5 py-3 text-sm text-foreground/80 font-bold focus:outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-2xs text-muted-fg font-bold uppercase tracking-widest">{t('agencyColor')}</label>
            <div className="flex gap-3">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(primaryColor) ? primaryColor : '#D4A843'}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-12 h-12 rounded-xl border border-border bg-card cursor-pointer p-1"
                aria-label={t('agencyColor')}
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#D4A843"
                maxLength={7}
                className="flex-1 bg-card border border-border focus:border-primary rounded-xl px-5 py-3 text-sm text-foreground/80 font-mono focus:outline-none"
              />
            </div>
          </div>
          <div className="md:col-span-3 flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-xl text-2xs font-extrabold uppercase tracking-widest transition-colors disabled:opacity-50 cursor-pointer"
            >
              {saving ? t('agencySaving') : t('agencySave')}
            </button>
            {saved && <span className="text-sm text-chartreuse font-bold">{t('agencySaved')}</span>}
            {error && <span className="text-sm text-destructive font-bold">{error}</span>}
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted-fg mb-8">{t('agencyNoPermission')}</p>
      )}

      <div className="border-t border-border pt-8 space-y-4">
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-muted-fg flex items-center gap-2">
          <Link2 className="w-4 h-4" /> {t('agencyPortalTitle')}
        </h3>
        <p className="text-sm text-muted-fg">{t('agencyPortalDesc')}</p>
        {canEdit && (
          <button
            onClick={generate}
            disabled={generating}
            className="px-6 py-2.5 rounded-xl border border-border text-2xs font-extrabold uppercase tracking-widest hover:border-primary/40 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {generating ? t('agencyGenerating') : t('agencyGenerate')}
          </button>
        )}
        {portalUrl && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-card border border-border rounded-xl px-4 py-3 truncate">{portalUrl}</code>
              <button
                onClick={() => copy(portalUrl)}
                aria-label={t('agencyCopy')}
                className="p-3 rounded-xl border border-border hover:border-primary/40 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-chartreuse" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div>
              <p className="text-2xs text-muted-fg font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5" /> {t('agencyEmbed')}
              </p>
              <code className="block text-xs font-mono bg-card border border-border rounded-xl p-4 overflow-x-auto whitespace-pre-wrap break-all">{embed}</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
