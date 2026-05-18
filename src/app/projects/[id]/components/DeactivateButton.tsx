'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import { useTransition } from 'react';
import { deactivateProject } from '@/app/actions/projects';
import { useRouter } from 'next/navigation';

export default function DeactivateButton({ projectId }: { projectId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleDeactivate = async () => {
    if (!window.confirm('¿Estás seguro de que deseas desactivar este proyecto? Se marcará como eliminado pero los datos se conservarán por 30 días.')) {
      return;
    }

    startTransition(async () => {
      try {
        const result = await deactivateProject({ projectId });
        if (result.data?.success) {
          router.push('/');
          router.refresh();
        } else {
          alert('Error al desactivar el proyecto: ' + (result.error || 'Desconocido'));
        }
      } catch (e) {
        console.error(e);
        alert('Ocurrió un error inesperado al desactivar el proyecto.');
      }
    });
  };

  return (
    <button 
      onClick={handleDeactivate}
      disabled={isPending}
      className="h-9 px-4 rounded-apple-pill text-[10px] font-bold uppercase tracking-[0.1em] text-red-500/50 hover:text-red-500 hover:bg-red-500/5 transition-all flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed group"
    >
      {isPending ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <AlertTriangle className="w-3 h-3 transition-transform group-hover:scale-110" />
      )}
      {isPending ? 'Deactivating...' : 'Deactivate Project'}
    </button>
  );
}
