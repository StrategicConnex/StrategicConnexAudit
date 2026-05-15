'use client';

import { FileSpreadsheet, Download } from 'lucide-react';
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
      className="w-full sm:w-auto bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
    >
      {isExporting ? (
        <svg className="animate-spin h-4 w-4 text-green-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : (
        <FileSpreadsheet className="w-4 h-4" />
      )}
      {isExporting ? 'Exportando...' : 'Keywords y Rankings (CSV)'}
    </button>
  );
}
