'use client';

import { FileSpreadsheet, Download, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface ExportCsvButtonProps {
  projectId: string;
}

export function ExportCsvButton({ projectId }: ExportCsvButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/export/keywords`);
      if (!response.ok) throw new Error('Failed to export');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `keywords-ranking-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error(e);
      alert('Error al exportar CSV. Asegúrate de tener palabras clave configuradas.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button 
      onClick={handleExport}
      disabled={isExporting}
      className="w-full sm:w-auto h-10 px-6 rounded-apple-pill text-[10px] font-bold uppercase tracking-[0.1em] transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed
        bg-apple-ink/5 text-apple-ink hover:bg-apple-ink hover:text-white border border-apple-ink/5 shadow-sm hover:shadow-md"
    >
      {isExporting ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <FileSpreadsheet className="w-3.5 h-3.5" />
      )}
      {isExporting ? 'Exporting...' : 'Export Keywords CSV'}
    </button>
  );
}
