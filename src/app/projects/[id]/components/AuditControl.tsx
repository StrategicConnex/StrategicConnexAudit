'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { triggerAudit, getAuditStatus } from '@/app/actions/audits';
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
      // Sube gradualmente del 0% al 15% mientras se encola
      intervalId = setInterval(() => {
        setProgress((prev) => {
          if (prev < 15) return prev + 1;
          return prev;
        });
      }, 150);
    } else if (status === 'running') {
      // Sube del 15% al 95% simulando el proceso de crawling y análisis
      // Se vuelve más lento a medida que se acerca al 95% para simular espera real
      intervalId = setInterval(() => {
        setProgress((prev) => {
          if (prev < 15) return 15;
          if (prev < 60) return prev + Math.floor(Math.random() * 3) + 1;
          if (prev < 85) return prev + 1;
          if (prev < 95) return prev + (Math.random() > 0.7 ? 1 : 0);
          return prev;
        });
      }, 200);
    } else if (status === 'completed') {
      // Se completa de golpe al 100%
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
          setErrorMessage(res.errorMessage || "El rastreador falló al descargar la web. Verifica que el dominio sea accesible.");
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error("Error al consultar el estado de la auditoría:", err);
      }
    }, 1200);

    return () => clearInterval(pollInterval);
  }, [auditId, status, projectId, router]);

  const handleStartAudit = () => {
    if (status === 'pending' || status === 'running') return;
    
    setErrorMessage(null);
    setStatus('pending');
    setProgress(2);

    startTransition(async () => {
      try {
        const res = await triggerAudit({ projectId });
        
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

  const isAuditing = status === 'pending' || status === 'running';
  const isDisabled = isAuditing || isPending || cooldown > 0;

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleStartAudit}
        disabled={isDisabled}
        className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all relative overflow-hidden flex items-center gap-2.5 shadow-lg border
          ${isDisabled 
            ? 'bg-primary/10 border-primary/30 text-primary cursor-not-allowed select-none min-w-[190px] justify-center' 
            : 'bg-primary hover:bg-primary/90 text-primary-foreground border-transparent hover:scale-[1.02] active:scale-[0.98]'}`}
        style={{
          // Crea un fondo de barra de carga sutil dentro del mismo botón para dar un efecto visual premium
          background: isAuditing 
            ? `linear-gradient(90deg, rgba(var(--color-primary), 0.15) ${progress}%, transparent ${progress}%)`
            : cooldown > 0
            ? `linear-gradient(90deg, rgba(var(--color-primary), 0.1) ${(cooldown/30)*100}%, transparent ${(cooldown/30)*100}%)`
            : undefined
        }}
      >
        {status === 'pending' && (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Encolando... {progress}%</span>
          </>
        )}
        {status === 'running' && (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Analizando... {progress}%</span>
          </>
        )}
        {status === 'completed' && (
          <>
            <CheckCircle2 className="w-4 h-4 text-green-400 animate-bounce" />
            <span>¡Completado! {progress}%</span>
          </>
        )}
        {status === 'failed' && (
          <>
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span>Reintentar Auditoría</span>
          </>
        )}
        {status === 'idle' && cooldown > 0 && (
          <>
            <Loader2 className="w-4 h-4 animate-spin opacity-50" />
            <span>Espera {cooldown}s</span>
          </>
        )}
        {status === 'idle' && cooldown === 0 && (
          <>
            <Play className="w-4 h-4 fill-current" />
            <span>Auditar Sitio Ahora</span>
          </>
        )}
      </button>

      {errorMessage && (
        <span className="text-[11px] text-red-400 font-medium max-w-xs text-right animate-pulse bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-md">
          {errorMessage}
        </span>
      )}
    </div>
  );
}
