'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { createProject } from '@/app/actions/projects';
import { Plus, X, Loader2 } from 'lucide-react';

export function NewProjectModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [state, setState] = useState<{ success?: boolean; message?: string; errors?: Record<string, string[]> } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Dragging state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('input, button')) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsPending(true);
    setState(null);
    
    try {
      const formData = new FormData(e.currentTarget);
      const actionResult = await createProject(formData);
      
      if (actionResult.error) {
        setState({ 
          success: false, 
          message: actionResult.error, 
          errors: actionResult.validationErrors 
        });
      } else if (actionResult.data?.error) {
        setState({
          success: false,
          message: actionResult.data.error
        });
      } else {
        setState({ success: true });
        setIsOpen(false);
        setPosition({ x: 0, y: 0 });
        formRef.current?.reset();
      }
    } catch {
      setState({ success: false, message: "An unexpected error occurred." });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-full transition-all shadow-[0_4px_12px_rgba(99,102,241,0.2)] hover:shadow-[0_4px_16px_rgba(99,102,241,0.3)] border border-indigo-500/20 font-bold text-[11px] uppercase tracking-widest"
      >
        <Plus size={14} strokeWidth={3} />
        <span>Nuevo Proyecto</span>
      </button>

      {isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-300">
          <div 
            className={`glass-card rounded-2xl w-full max-w-md p-8 shadow-2xl relative animate-in zoom-in-95 duration-300 border border-white/[0.06] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <button 
              onClick={() => {
                setIsOpen(false);
                setState(null);
                setPosition({ x: 0, y: 0 });
              }}
              className="absolute top-5 right-5 text-slate-500 hover:text-white transition-colors cursor-pointer"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
            
            <div className="mb-6 pointer-events-none select-none">
              <h2 className="text-xl font-bold text-white tracking-tight">Agregar Dominio</h2>
              <p className="text-xs font-semibold text-slate-400 mt-1">Configure un nuevo sitio para monitoreo SEO y Core Web Vitals.</p>
            </div>
            
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 cursor-auto">
              <div className="space-y-2">
                <label htmlFor="name" className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1">Nombre del Proyecto</label>
                <input 
                  type="text" 
                  id="name" 
                  name="name" 
                  className="w-full bg-[#08080a]/60 border border-white/[0.08] focus:border-[#06b6d4]/40 rounded-xl px-4 py-3 text-white text-xs font-semibold focus:outline-none transition-all duration-300 shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
                  placeholder="Ej: Mi Startup Ecommerce"
                  required
                />
                {state?.errors?.name && (
                  <p className="text-red-400 text-[10px] font-extrabold mt-1.5 ml-1 uppercase tracking-tight">{state.errors.name[0]}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <label htmlFor="baseUrl" className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1">URL Base (Dominio)</label>
                <input 
                  type="url" 
                  id="baseUrl" 
                  name="baseUrl" 
                  className="w-full bg-[#08080a]/60 border border-white/[0.08] focus:border-[#06b6d4]/40 rounded-xl px-4 py-3 text-white text-xs font-semibold focus:outline-none transition-all duration-300 shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
                  placeholder="https://ejemplo.com"
                  required
                />
                {state?.errors?.baseUrl && (
                  <p className="text-red-400 text-[10px] font-extrabold mt-1.5 ml-1 uppercase tracking-tight">{state.errors.baseUrl[0]}</p>
                )}
              </div>

              {state?.message && !state?.success && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-semibold">
                  {state.message}
                </div>
              )}

              <div className="pt-4 flex items-center justify-end gap-4">
                <button 
                  type="button" 
                  onClick={() => {
                    setIsOpen(false);
                    setState(null);
                    setPosition({ x: 0, y: 0 });
                  }}
                  className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500 hover:text-white transition-colors"
                  disabled={isPending}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isPending}
                  className="flex items-center gap-2 px-6 py-2.5 bg-white text-black font-extrabold rounded-full hover:bg-slate-200 transition-all disabled:opacity-50 text-[11px] uppercase tracking-widest shadow-md hover:shadow-[0_2px_15px_rgba(255,255,255,0.2)]"
                >
                  {isPending ? <Loader2 size={14} className="animate-spin text-black" /> : 'Crear Proyecto'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
