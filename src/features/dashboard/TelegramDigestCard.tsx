'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Send } from 'lucide-react';
import { updateProjectNotifications } from '@/app/actions/projects';

/**
 * TelegramDigestCard — chat para el resumen semanal (B-5).
 * Guarda telegramChatId en projects.settings (solo admin+; el servidor revalida).
 */
export function TelegramDigestCard({ projectId }: { projectId: string }) {
  const t = useTranslations('monitoring');
  const [chatId, setChatId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    if (!projectId) return Promise.resolve();
    return fetch(`/api/projects/${projectId}/branding`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (data.success && data.telegramChatId) setChatId(String(data.telegramChatId));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await updateProjectNotifications({ projectId, telegramChatId: chatId });
      if (result.data?.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!projectId) return null;

  return (
    <div className="glass-card rounded-xl p-6 relative overflow-hidden flex flex-col justify-between border border-border/50">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
            <Send className="w-4 h-4" />
          </span>
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/80">{t('tgTitle')}</h3>
        </div>
        <p className="text-xs text-muted-fg mb-4 leading-relaxed">{t('tgDesc')}</p>
        {loaded && (
          <form onSubmit={save} className="flex gap-2">
            <input
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              aria-label={t('tgPlaceholder')}
              placeholder={t('tgPlaceholder')}
              className="flex-1 min-w-0 bg-card border border-border focus:border-primary rounded-xl px-4 py-2.5 text-sm text-foreground/80 font-mono focus:outline-none"
            />
            <button
              type="submit"
              disabled={saving}
              className="shrink-0 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-2xs font-extrabold uppercase tracking-widest hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {saved ? t('tgSaved') : t('tgSave')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
