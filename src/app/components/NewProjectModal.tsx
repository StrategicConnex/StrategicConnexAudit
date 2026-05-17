'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { createProject } from '@/app/actions/projects';
import { Plus, X, Loader2 } from 'lucide-react';

export function NewProjectModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [state, setState] = useState<{ success?: boolean; message?: string; errors?: any } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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
    } catch (error) {
      setState({ success: false, message: "An unexpected error occurred." });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-5 py-2.5 bg-apple-blue text-white rounded-apple-pill hover:opacity-90 transition-all shadow-sm font-bold text-[13px] tracking-tight"
      >
        <Plus size={16} strokeWidth={3} />
        <span>Nuevo Proyecto</span>
      </button>

      {isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/45 backdrop-blur-md animate-in fade-in duration-300">
          <div 
            className={`glass-card rounded-apple-md w-full max-w-md p-10 shadow-2xl relative animate-in zoom-in-95 duration-500 border border-apple-gray-dark/10 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
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
              className="absolute top-6 right-6 text-apple-ink/20 hover:text-apple-ink transition-colors cursor-pointer"
            >
              <X size={20} strokeWidth={2.5} />
            </button>
            
            <div className="mb-8 pointer-events-none select-none">
              <h2 className="text-2xl font-bold text-apple-ink tracking-tight">Agregar Dominio</h2>
              <p className="text-[13px] font-medium text-apple-ink/40 mt-1.5">Configure un nuevo sitio para monitoreo SEO y Core Web Vitals.</p>
            </div>
            
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-6 cursor-auto">
              <div className="space-y-2">
                <label htmlFor="name" className="text-[11px] font-bold text-apple-ink/40 uppercase tracking-widest ml-1">Nombre del Proyecto</label>
                <input 
                  type="text" 
                  id="name" 
                  name="name" 
                  className="w-full bg-apple-gray border border-apple-gray-dark/5 rounded-apple-sm px-4 py-3 text-apple-ink text-[14px] font-medium focus:outline-none focus:border-apple-blue/50 transition-all"
                  placeholder="Ej: Mi Startup Ecommerce"
                />
                {state?.errors?.name && (
                  <p className="text-red-500 text-[11px] font-bold mt-1.5 ml-1 uppercase tracking-tight">{state.errors.name[0]}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <label htmlFor="baseUrl" className="text-[11px] font-bold text-apple-ink/40 uppercase tracking-widest ml-1">URL Base (Dominio)</label>
                <input 
                  type="text" 
                  id="baseUrl" 
                  name="baseUrl" 
                  className="w-full bg-apple-gray border border-apple-gray-dark/5 rounded-apple-sm px-4 py-3 text-apple-ink text-[14px] font-medium focus:outline-none focus:border-apple-blue/50 transition-all"
                  placeholder="https://ejemplo.com"
                />
                {state?.errors?.baseUrl && (
                  <p className="text-red-500 text-[11px] font-bold mt-1.5 ml-1 uppercase tracking-tight">{state.errors.baseUrl[0]}</p>
                )}
              </div>

              {state?.message && !state?.success && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-apple-sm text-red-600 text-xs font-bold">
                  {state.message}
                </div>
              )}

              <div className="pt-6 flex items-center justify-end gap-4">
                <button 
                  type="button" 
                  onClick={() => {
                    setIsOpen(false);
                    setState(null);
                    setPosition({ x: 0, y: 0 });
                  }}
                  className="text-[13px] font-bold text-apple-ink/40 hover:text-apple-ink transition-colors"
                  disabled={isPending}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isPending}
                  className="flex items-center gap-2 px-6 py-2.5 bg-apple-ink text-black font-bold rounded-apple-pill hover:opacity-90 transition-all disabled:opacity-50 text-[13px]"
                >
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : 'Crear Proyecto'}
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
