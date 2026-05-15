'use client';

import { AlertTriangle } from 'lucide-react';
import { useState, useTransition } from 'react';
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
      className="bg-destructive/10 text-red-400 hover:bg-destructive/20 hover:text-red-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border border-destructive/20 disabled:opacity-50"
    >
      {isPending ? (
        <svg className="animate-spin h-4 w-4 text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : (
        <AlertTriangle className="w-4 h-4" />
      )}
      {isPending ? 'Desactivando...' : 'Desactivar Proyecto'}
    </button>
  );
}
