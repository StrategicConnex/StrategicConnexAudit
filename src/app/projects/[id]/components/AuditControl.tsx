'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startAuditAction, getAuditStatus } from '@/app/actions/audits';
import { Play, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface AuditControlProps {
  projectId: string;
}

export default function AuditControl({ projectId }: AuditControlProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [auditId, setAuditId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'pending' | 'running' | 'completed' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [showWorkerWarning, setShowWorkerWarning] = useState(false);
  const isAuditing = status === 'pending' || status === 'running';

  // Efecto para el contador regresivo del Rate Limit
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Efecto de interpolación de progreso súper suave y realista
  useEffect(() => {
    if (status === 'idle') {
      setProgress(0);
      return;
    }

    let intervalId: NodeJS.Timeout;

    if (status === 'pending') {
      intervalId = setInterval(() => {
        setProgress((prev) => {
          if (prev < 12) return prev + 1;
          if (prev < 19) return prev + 0.2;
          return prev;
        });
      }, 200);
    } else if (status === 'running') {
      intervalId = setInterval(() => {
        setProgress((prev) => {
          if (prev < 15) return prev + 2;
          if (prev < 45) return prev + (Math.random() > 0.4 ? 1 : 0.5);
          if (prev < 75) return prev + (Math.random() > 0.7 ? 0.5 : 0.2);
          if (prev < 92) return prev + (Math.random() > 0.9 ? 0.2 : 0.1);
          return prev;
        });
      }, 300);
    } else if (status === 'completed') {
      setProgress(100);
    }

    return () => clearInterval(intervalId);
  }, [status]);

  // Efecto de sondeo (polling) de estado en la Base de Datos
  useEffect(() => {
    if (!auditId || status === 'completed' || status === 'failed') return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await getAuditStatus({ auditId });
        
        if (res.error) {
           console.error("Auth error polling:", res.error);
           return;
        }

        const dbStatus = res.data?.status || 'pending';
        
        if (dbStatus === 'running' && status === 'pending') {
          setStatus('running');
        } else if (dbStatus === 'completed') {
          setStatus('completed');
          clearInterval(pollInterval);
          
          setTimeout(() => {
            router.push(`/projects/${projectId}/audits/${auditId}`);
            router.refresh();
          }, 1000);
        } else if (dbStatus === 'failed') {
          setStatus('failed');
          setErrorMessage(res.data?.errorMessage || "El rastreador falló al descargar la web. Verifica que el dominio sea accesible.");
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
      setShowWorkerWarning(false);
    }
    return () => clearInterval(timeout);
  }, [isAuditing, status, progress]);

  const handleStartAudit = () => {
    if (status === 'pending' || status === 'running') return;
    
    setErrorMessage(null);
    setStatus('pending');
    setProgress(5);

    startTransition(async () => {
      try {
        const res = await startAuditAction({ projectId });
        
        if (res.error) {
          setStatus('failed');
          setErrorMessage(res.error);
          return;
        }

        const result = res.data;
        if (result?.success && result.auditId) {
          setAuditId(result.auditId);
          setCooldown(30);
        } else {
          setStatus('failed');
          setErrorMessage(result?.message || "Error al solicitar inicio de auditoría.");
          
          const waitMatch = result?.message?.match(/\d+/);
          if (waitMatch) {
            setCooldown(parseInt(waitMatch[0]));
          }
        }
      } catch (err) {
        setStatus('failed');
        setErrorMessage("Error de conexión al servidor.");
      }
    });
  };

  const isDisabled = isAuditing || isPending || cooldown > 0;

  return (
    <div className="flex flex-col items-end gap-3">
      <button
        onClick={handleStartAudit}
        disabled={isDisabled}
        className={`relative h-11 px-8 rounded-apple-pill text-xs font-semibold tracking-widest uppercase transition-all overflow-hidden flex items-center justify-center gap-2.5 
          ${isDisabled 
            ? 'bg-apple-gray/40 text-apple-ink/40 cursor-not-allowed border border-apple-ink/5' 
            : 'bg-apple-blue text-white shadow-[0_4px_12px_rgba(0,113,227,0.3)] hover:shadow-[0_6px_16px_rgba(0,113,227,0.4)] hover:scale-[1.02] active:scale-[0.98]'}`}
      >
        {/* Background Progress Layer */}
        {isAuditing && (
          <div 
            className="absolute inset-0 bg-apple-ink/5 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        )}
        
        {cooldown > 0 && status === 'idle' && (
          <div 
            className="absolute inset-0 bg-apple-ink/10 transition-all duration-1000 linear"
            style={{ width: `${(cooldown/30)*100}%` }}
          />
        )}

        <div className="relative z-10 flex items-center gap-2.5">
          {status === 'pending' && (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Initializing {progress}%</span>
            </>
          )}
          {status === 'running' && (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Auditing {progress}%</span>
            </>
          )}
          {status === 'completed' && (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 animate-bounce" />
              <span>Success {progress}%</span>
            </>
          )}
          {status === 'failed' && (
            <>
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Retry Audit</span>
            </>
          )}
          {status === 'idle' && cooldown > 0 && (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin opacity-50" />
              <span>Wait {cooldown}s</span>
            </>
          )}
          {status === 'idle' && cooldown === 0 && (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Audit</span>
            </>
          )}
        </div>
      </button>

      {errorMessage && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-apple-sm bg-red-500/5 border border-red-500/10 max-w-xs animate-in fade-in slide-in-from-top-1">
          <AlertCircle className="w-3 h-3 text-red-500" />
          <span className="text-[10px] text-red-500/80 font-medium text-right leading-tight">
            {errorMessage}
          </span>
        </div>
      )}

      {showWorkerWarning && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-apple-sm bg-apple-gray/50 border border-apple-ink/5 max-w-xs animate-pulse">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span className="text-[10px] text-apple-ink/60 font-medium text-right leading-tight">
            Server response delayed. Waiting for analyzer...
          </span>
        </div>
      )}
    </div>
  );
}
