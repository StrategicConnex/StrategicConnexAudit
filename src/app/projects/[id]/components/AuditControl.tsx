'use client';

import { useState, useEffect, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { startAuditAction, getAuditStatus, cancelAuditAction } from '@/app/actions/audits';
import { Play, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { AuditConfigModal, type AuditConfig } from './AuditConfigModal';
import { AuditProgress } from '@/components/AuditProgress';
import { AuditStatusBadge } from '@/components/ui/AuditStatusBadge';

interface AuditControlProps {
  projectId: string;
  projectName?: string;
}

type AuditPhase = 'idle' | 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

export default function AuditControl({ projectId, projectName }: AuditControlProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [auditId, setAuditId] = useState<string | null>(null);
  const [status, setStatus] = useState<AuditPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [pagesScanned, setPagesScanned] = useState(0);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [showWorkerWarning, setShowWorkerWarning] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const startTimeRef = useRef<number>(0);
  const isAuditing = status === 'pending' || status === 'running';

  const changeStatus = (newStatus: AuditPhase) => {
    setStatus(newStatus);
    if (newStatus === 'idle' || newStatus === 'failed' || newStatus === 'canceled') {
      setProgress(0);
    } else if (newStatus === 'completed') {
      setProgress(100);
    }
  };

  // Efecto para el contador regresivo del Rate Limit
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Cronómetro del progreso (tiempo real transcurrido)
  useEffect(() => {
    if (!isAuditing) return;
    const timer = setInterval(() => {
      setElapsedSecs(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isAuditing]);

  // Efecto de interpolación de progreso súper suave y realista
  useEffect(() => {
    if (status !== 'pending' && status !== 'running') return;

    const intervalId = setInterval(() => {
      setProgress((prev) => {
        if (status === 'pending') {
          if (prev < 12) return prev + 1;
          if (prev < 19) return prev + 0.2;
        } else if (status === 'running') {
          if (prev < 15) return prev + 2;
          if (prev < 45) return prev + (Math.random() > 0.4 ? 1 : 0.5);
          if (prev < 75) return prev + (Math.random() > 0.7 ? 0.5 : 0.2);
          if (prev < 92) return prev + (Math.random() > 0.9 ? 0.2 : 0.1);
        }
        return prev;
      });
    }, status === 'pending' ? 200 : 300);

    return () => clearInterval(intervalId);
  }, [status]);

  // Efecto de sondeo (polling) de estado en la Base de Datos
  useEffect(() => {
    if (!auditId || status === 'completed' || status === 'failed' || status === 'canceled') return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await getAuditStatus({ auditId });

        if (res.error) {
           console.error("Auth error polling:", res.error);
           return;
        }

        if (typeof res.data?.pagesScanned === 'number') {
          setPagesScanned(res.data.pagesScanned);
        }

        const dbStatus = res.data?.status || 'pending';

        if (dbStatus === 'running' && status === 'pending') {
          changeStatus('running');
        } else if (dbStatus === 'completed') {
          changeStatus('completed');
          clearInterval(pollInterval);

          setTimeout(() => {
            router.push(`/projects/${projectId}/audits/${auditId}`);
            router.refresh();
          }, 1000);
        } else if (dbStatus === 'failed') {
          changeStatus('failed');
          setErrorMessage(res.data?.errorMessage || "El rastreador falló al descargar la web. Verifica que el dominio sea accesible.");
          clearInterval(pollInterval);
        } else if (dbStatus === 'canceled') {
          changeStatus('canceled');
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error("Error al consultar el estado de la auditoría:", err);
      }
    }, 1200);

    return () => clearInterval(pollInterval);
  }, [auditId, status, projectId, router]);

  // Detector de "congelamiento" en 15% (Worker no responde)
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (isAuditing && status === 'pending' && progress >= 18) {
      timeout = setTimeout(() => {
        setShowWorkerWarning(true);
      }, 45000);
    } else {
      if (showWorkerWarning) {
        timeout = setTimeout(() => {
          setShowWorkerWarning(false);
        }, 0);
      }
    }
    return () => clearTimeout(timeout);
  }, [isAuditing, status, progress, showWorkerWarning]);

  const handleConfirmAudit = (config: AuditConfig) => {
    if (status === 'pending' || status === 'running') return;

    setErrorMessage(null);
    setPagesScanned(0);
    setElapsedSecs(0);
    startTimeRef.current = Date.now();
    changeStatus('pending');
    setProgress(5);

    startTransition(async () => {
      try {
        const res = await startAuditAction({ projectId, ...config });

        if (res.error) {
          changeStatus('failed');
          setErrorMessage(res.error);
          return;
        }

        const result = res.data;
        if (result?.success && result.auditId) {
          setConfigOpen(false);
          setAuditId(result.auditId);
          setCooldown(30);
        } else {
          changeStatus('failed');
          setErrorMessage(result?.message || "Error al solicitar inicio de auditoría.");

          const waitMatch = result?.message?.match(/\d+/);
          if (waitMatch) {
            setCooldown(parseInt(waitMatch[0]));
          }
        }
      } catch {
        changeStatus('failed');
        setErrorMessage("Error de conexión al servidor.");
      }
    });
  };

  const handleCancel = async () => {
    if (!auditId || cancelling) return;
    setCancelling(true);
    try {
      const res = await cancelAuditAction({ auditId });
      if (res.data?.success) {
        changeStatus('canceled');
      } else {
        setErrorMessage(res.data?.message || res.error || "No se pudo cancelar.");
      }
    } catch {
      setErrorMessage("Error de conexión al servidor.");
    } finally {
      setCancelling(false);
    }
  };


  const isDisabled = isAuditing || isPending || cooldown > 0;

  return (
    <div className="flex flex-col items-end gap-3">
      {!isAuditing && status !== 'canceled' && (
        <button
          onClick={() => setConfigOpen(true)}
          disabled={isDisabled}
          className={`relative h-11 px-8 rounded-full text-xs font-semibold tracking-widest uppercase transition-all overflow-hidden flex items-center justify-center gap-2.5
            ${isDisabled
              ? 'bg-muted/40 text-muted-fg cursor-not-allowed border border-border'
              : 'bg-corporate-primary text-white shadow-[0_4px_12px_rgba(30,58,95,0.4)] hover:bg-corporate-primary-light hover:shadow-[0_6px_16px_rgba(30,58,95,0.5)] hover:scale-[1.02] active:scale-[0.98]'}`}
        >
          {cooldown > 0 && status === 'idle' && (
            <div
              className="absolute inset-0 bg-white/10 transition-all duration-1000 linear"
              style={{ width: `${(cooldown/30)*100}%` }}
            />
          )}

          <div className="relative z-10 flex items-center gap-2.5">
            {status === 'completed' && (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 animate-bounce" />
                <span>Éxito 100%</span>
              </>
            )}
            {status === 'failed' && (
              <>
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Reintentar auditoría</span>
              </>
            )}
            {status === 'idle' && cooldown > 0 && (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin opacity-50" />
                <span>Espera {cooldown}s</span>
              </>
            )}
            {status === 'idle' && cooldown === 0 && (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Iniciar auditoría</span>
              </>
            )}
          </div>
        </button>
      )}

      {isAuditing && (
        <AuditProgress
          status={status}
          progress={progress}
          pagesScanned={pagesScanned}
          elapsedSecs={elapsedSecs}
          onCancel={handleCancel}
          cancelling={cancelling}
        />
      )}

      {status === 'canceled' && (
        <div className="flex flex-col items-end gap-2">
          <AuditStatusBadge status="canceled" />
          <button
            onClick={() => changeStatus('idle')}
            className="h-11 px-8 rounded-full text-xs font-semibold tracking-widest uppercase transition-all flex items-center justify-center gap-2.5 bg-corporate-primary text-white shadow-[0_4px_12px_rgba(30,58,95,0.4)] hover:bg-corporate-primary-light cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Nueva auditoría</span>
          </button>
        </div>
      )}

      <AuditConfigModal
        open={configOpen}
        onOpenChange={setConfigOpen}
        projectName={projectName ?? 'este proyecto'}
        pending={isPending}
        error={errorMessage}
        onConfirm={handleConfirmAudit}
      />

      {errorMessage && !configOpen && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20 max-w-xs animate-in fade-in slide-in-from-top-1">
          <AlertCircle className="w-3 h-3 text-destructive" />
          <span className="text-2xs text-destructive/80 font-medium text-right leading-tight">
            {errorMessage}
          </span>
        </div>
      )}

      {showWorkerWarning && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border border-border max-w-xs animate-pulse">
          <div className="w-1.5 h-1.5 rounded-full bg-chart-warning" />
          <span className="text-2xs text-muted-fg font-medium text-right leading-tight">
            Server response delayed. Waiting for analyzer...
          </span>
        </div>
      )}
    </div>
  );
}
