'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogPortal,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogCloseButton,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT AuditConfigModal — configuración previa al inicio: tipo de
   auditoría (los 4 del enum DB), profundidad 1-5 y user-agent, con
   resumen de lo que se ejecutará. La config persiste en audits.config
   (jsonb, sin migración). Semana 7 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

export type AuditType = 'crawl' | 'performance' | 'technical' | 'full';

export interface AuditConfig {
  type: AuditType;
  depth: number;
  userAgent: string;
}

const TYPES: { value: AuditType; name: string; desc: string }[] = [
  { value: 'full', name: 'Completa', desc: 'Rastreo + rendimiento + técnica' },
  { value: 'technical', name: 'Técnica', desc: 'SEO on-page: titles, metas, H1' },
  { value: 'performance', name: 'Rendimiento', desc: 'Core Web Vitals y recursos' },
  { value: 'crawl', name: 'Rastreo', desc: 'Mapa del sitio y enlaces' },
];

export const DEFAULT_USER_AGENT = 'StrategicAuditBot/1.0';

export function AuditConfigModal({
  open,
  onOpenChange,
  projectName,
  defaultDepth = 3,
  defaultUserAgent = DEFAULT_USER_AGENT,
  pending = false,
  error = null,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  defaultDepth?: number;
  defaultUserAgent?: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: (config: AuditConfig) => void;
}) {
  const [type, setType] = useState<AuditType>('full');
  const [depth, setDepth] = useState(defaultDepth);
  const [userAgent, setUserAgent] = useState(defaultUserAgent);
  const selectedType = TYPES.find((t) => t.value === type)!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup className="max-w-lg">
          <DialogCloseButton />
          <DialogTitle>Nueva auditoría</DialogTitle>
          <DialogDescription>
            {projectName} — elige el alcance antes de empezar.
          </DialogDescription>

          <div className="mt-6 space-y-6">
            <fieldset>
              <legend className="text-2xs font-extrabold uppercase tracking-widest text-muted-fg">
                Tipo de auditoría
              </legend>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2" role="group">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={type === t.value}
                    onClick={() => setType(t.value)}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-colors duration-150 cursor-pointer',
                      type === t.value
                        ? 'border-corporate-primary/40 bg-corporate-primary/10'
                        : 'border-border bg-muted/20 hover:border-primary/30',
                    )}
                  >
                    <span className="block text-xs font-bold text-foreground">{t.name}</span>
                    <span className="mt-0.5 block text-2xs text-muted-fg">{t.desc}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-2xs font-extrabold uppercase tracking-widest text-muted-fg">
                Profundidad de rastreo
              </legend>
              <div className="mt-2 flex gap-2" role="group" aria-label="Profundidad">
                {[1, 2, 3, 4, 5].map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={depth === d}
                    aria-label={`Nivel ${d}`}
                    onClick={() => setDepth(d)}
                    className={cn(
                      'flex size-10 items-center justify-center rounded-xl border text-xs font-extrabold tabular-nums transition-colors duration-150 cursor-pointer',
                      depth === d
                        ? 'border-corporate-primary/40 bg-corporate-primary text-white'
                        : 'border-border bg-muted/20 text-muted-fg hover:border-primary/30 hover:text-foreground',
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <label
                htmlFor="audit-user-agent"
                className="text-2xs font-extrabold uppercase tracking-widest text-muted-fg"
              >
                User-Agent
              </label>
              <input
                id="audit-user-agent"
                type="text"
                value={userAgent}
                onChange={(e) => setUserAgent(e.target.value)}
                className="mt-2 w-full rounded-xl border border-border bg-muted/60 px-4 py-3 font-mono text-xs text-foreground focus:border-primary/40 focus:outline-none transition-colors"
              />
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs">
              <p className="text-2xs font-extrabold uppercase tracking-widest text-muted-fg">
                Se ejecutará
              </p>
              <p className="mt-1.5 font-semibold text-foreground">
                {selectedType.name} · Nivel {depth} · {userAgent || DEFAULT_USER_AGENT}
              </p>
              <p className="mt-1 text-2xs text-muted-fg">
                Límite de 1 auditoría cada 30 segundos por proyecto.
              </p>
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button
                variant="corporate"
                onClick={() =>
                  onConfirm({ type, depth, userAgent: userAgent.trim() || DEFAULT_USER_AGENT })
                }
                disabled={pending}
              >
                {pending && <Loader2 size={14} className="animate-spin" />}
                {pending ? 'Iniciando…' : 'Iniciar auditoría'}
              </Button>
            </div>
          </div>
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
