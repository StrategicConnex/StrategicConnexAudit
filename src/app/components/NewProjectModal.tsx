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
    // Don't drag if clicking inside an input or button
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
        className="flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)]/10 text-[var(--color-primary)] rounded-lg hover:bg-[var(--color-primary)]/20 transition-colors border border-[var(--color-primary)]/20"
      >
        <Plus size={18} />
        <span className="font-medium text-sm">New Project</span>
      </button>

      {isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background">
          <div 
            className={`glass-card w-full max-w-md p-6 relative animate-in fade-in zoom-in-95 duration-200 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
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
              className="absolute top-4 right-4 text-[var(--color-muted-foreground)] hover:text-white transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
            
            <h2 className="text-xl font-bold text-white mb-6 pointer-events-none select-none">Create New Project</h2>
            
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 cursor-auto">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-[var(--color-muted-foreground)] mb-1">Project Name</label>
                <input 
                  type="text" 
                  id="name" 
                  name="name" 
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[var(--color-primary)]/50 focus:ring-1 focus:ring-[var(--color-primary)]/50 transition-all"
                  placeholder="e.g. My Awesome Startup"
                />
                {state?.errors?.name && (
                  <p className="text-red-400 text-xs mt-1">{state.errors.name[0]}</p>
                )}
              </div>
              
              <div>
                <label htmlFor="baseUrl" className="block text-sm font-medium text-[var(--color-muted-foreground)] mb-1">Base URL</label>
                <input 
                  type="text" 
                  id="baseUrl" 
                  name="baseUrl" 
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[var(--color-primary)]/50 focus:ring-1 focus:ring-[var(--color-primary)]/50 transition-all"
                  placeholder="https://example.com"
                />
                {state?.errors?.baseUrl && (
                  <p className="text-red-400 text-xs mt-1">{state.errors.baseUrl[0]}</p>
                )}
              </div>

              {state?.message && !state?.success && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {state.message}
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => {
                    setIsOpen(false);
                    setState(null);
                    setPosition({ x: 0, y: 0 });
                  }}
                  className="px-4 py-2 text-sm font-medium text-[var(--color-muted-foreground)] hover:text-white transition-colors"
                  disabled={isPending}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] text-[var(--color-background)] font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isPending ? <Loader2 size={18} className="animate-spin" /> : 'Create Project'}
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
