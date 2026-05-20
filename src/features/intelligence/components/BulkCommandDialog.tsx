import React, { useState } from "react";

interface BulkCommandDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export function BulkCommandDialog({ isOpen, onClose, projectId }: BulkCommandDialogProps) {
  const [targets, setTargets] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const targetList = targets
      .split("\n")
      .map(t => t.trim())
      .filter(t => t.length > 0);

    if (targetList.length === 0) {
      setMessage({ text: "Debes ingresar al menos un objetivo.", type: "error" });
      setLoading(false);
      return;
    }

    if (targetList.length > 50) {
      setMessage({ text: "El límite máximo por lote es de 50 objetivos.", type: "error" });
      setLoading(false);
      return;
    }

    try {
      // Nota: En un entorno de producción, la API Key se obtendría del contexto del equipo
      // Aquí usamos el endpoint asumiendo que un cliente interno lo llama, o adaptamos el auth.
      // Para efectos de UI interna, esto normalmente llamaría a un endpoint distinto que usa cookies,
      // o adaptaríamos /api/intelligence/bulk para soportar Session Auth también.
      
      const res = await fetch("/api/intelligence/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Demo API key header para simular Headless enterprise request si fuera necesario
          "Authorization": `Bearer dev_demo_key` 
        },
        body: JSON.stringify({ projectId, targets: targetList })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Fallo al procesar lote");
      }

      setMessage({ text: data.message || "Investigaciones puestas en cola.", type: "success" });
      setTargets("");
      
      // Cerrar tras éxito después de un breve delay
      setTimeout(() => {
        onClose();
        setMessage(null);
      }, 2000);

    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg text-white font-mono">
        <h2 className="text-xl font-semibold mb-4 text-emerald-400">⚡ Bulk Intelligence Analysis</h2>
        
        <p className="text-sm text-gray-400 mb-4">
          Ingresa múltiples dominios o direcciones IP (uno por línea). Límite de 50 por lote.
          El consumo estimado es proporcional al número de objetivos.
        </p>

        {message && (
          <div className={`p-3 mb-4 rounded text-sm ${message.type === 'success' ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-800' : 'bg-red-900/50 text-red-300 border border-red-800'}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <textarea
            value={targets}
            onChange={(e) => setTargets(e.target.value)}
            placeholder="google.com&#10;8.8.8.8&#10;microsoft.com"
            className="w-full h-40 p-3 bg-gray-950 border border-gray-800 rounded focus:border-emerald-500 focus:outline-none mb-4 font-mono text-sm resize-none"
            disabled={loading}
          />
          
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || targets.trim() === ""}
              className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Despachando..." : "Ejecutar Lote"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
