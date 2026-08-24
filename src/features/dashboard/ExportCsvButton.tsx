'use client';

import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';

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
    <Button
      onClick={handleExport}
      disabled={isExporting}
      variant="muted"
      size="md"
      shape="pill"
      press="none"
      className="w-full sm:w-auto px-6"
    >
      {isExporting ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
      )}
      {isExporting ? 'Exporting...' : 'Export Keywords CSV'}
    </Button>
  );
}
