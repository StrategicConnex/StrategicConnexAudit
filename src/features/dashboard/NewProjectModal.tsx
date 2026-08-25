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
        className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-primary to-primary/80 hover:from-primary hover:to-primary/80 text-foreground rounded-full transition-[color,background-color,border-color,box-shadow] shadow-[0_4px_12px_rgba(98,113,196,0.2)] hover:shadow-[0_4px_16px_rgba(98,113,196,0.3)] border border-primary/20 font-bold text-2xs uppercase tracking-widest"
      >
        <Plus size={14} strokeWidth={3} />
        <span>Nuevo Proyecto</span>
      </button>

      {isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-300">
          <div 
            className={`glass-card rounded-2xl w-full max-w-md p-8 shadow-2xl relative animate-in zoom-in-95 duration-300 border border-border ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
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
              className="absolute top-5 right-5 text-muted-fg hover:text-white transition-colors cursor-pointer"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
            
            <div className="mb-6 pointer-events-none select-none">
              <h2 className="text-xl font-bold text-foreground tracking-tight">Agregar Dominio</h2>
              <p className="text-xs font-semibold text-muted-fg mt-1">Configure un nuevo sitio para monitoreo SEO y Core Web Vitals.</p>
            </div>
            
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 cursor-auto">
              <div className="space-y-2">
                <label htmlFor="name" className="text-2xs font-extrabold text-muted-fg uppercase tracking-widest ml-1">Nombre del Proyecto</label>
                <input 
                  type="text" 
                  id="name" 
                  name="name" 
                  className="w-full bg-muted/60 border border-border focus:border-primary/40 rounded-xl px-4 py-3 text-foreground text-xs font-semibold focus:outline-none transition-[color,background-color,border-color,box-shadow] duration-300 shadow-sm"
                  placeholder="Ej: Mi Startup Ecommerce"
                  required
                />
                {state?.errors?.name && (
                  <p className="text-destructive text-2xs font-extrabold mt-1.5 ml-1 uppercase tracking-tight">{state.errors.name[0]}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <label htmlFor="baseUrl" className="text-2xs font-extrabold text-muted-fg uppercase tracking-widest ml-1">URL Base (Dominio)</label>
                <input 
                  type="url" 
                  id="baseUrl" 
                  name="baseUrl" 
                  className="w-full bg-muted/60 border border-border focus:border-primary/40 rounded-xl px-4 py-3 text-foreground text-xs font-semibold focus:outline-none transition-[color,background-color,border-color,box-shadow] duration-300 shadow-sm"
                  placeholder="https://ejemplo.com"
                  required
                />
                {state?.errors?.baseUrl && (
                  <p className="text-destructive text-2xs font-extrabold mt-1.5 ml-1 uppercase tracking-tight">{state.errors.baseUrl[0]}</p>
                )}
              </div>

              {state?.message && !state?.success && (
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs font-semibold">
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
                  className="text-2xs font-extrabold uppercase tracking-widest text-muted-fg hover:text-white transition-colors"
                  disabled={isPending}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isPending}
                  className="flex items-center gap-2 px-6 py-2.5 bg-foreground text-background font-extrabold rounded-full hover:bg-foreground/90 transition-[color,background-color,opacity,box-shadow] disabled:opacity-50 text-2xs uppercase tracking-widest shadow-md hover:shadow-[0_2px_15px_rgba(255,255,255,0.1)]"
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
