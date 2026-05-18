"use client";
import React, { useState } from "react";
import { FadeUp } from "../ui/FadeUp";
import { useCursorStore } from "@/lib/store/useCursorStore";

export function CTA() {
  const [formStatus, setFormStatus] = useState("idle");
  const setHovering = useCursorStore((state) => state.setHovering);

  const handleForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormStatus("processing");
    
    const target = e.currentTarget;
    const formData = {
      name: (target.elements.namedItem("name") as HTMLInputElement).value,
      company: (target.elements.namedItem("company") as HTMLInputElement).value,
      email: (target.elements.namedItem("email") as HTMLInputElement).value,
      message: (target.elements.namedItem("message") as HTMLTextAreaElement).value,
      website: (target.elements.namedItem("website") as HTMLInputElement).value
    };

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setFormStatus("done");
        target.reset(); // Limpiar el formulario
      } else {
        console.error("Error enviando correo.");
        setFormStatus("idle"); // Volver a permitir enviar
      }
    } catch (error) {
      console.error(error);
      setFormStatus("idle");
    }

    // Resetear el botón de éxito después de unos segundos
    setTimeout(() => {
      setFormStatus("idle");
    }, 4500);
  };

  return (
    <section id="cta">
      <div className="cta-glow" aria-hidden={true}></div>
      <div className="cta-grid" aria-hidden={true}></div>
      <div className="cta-wrapper">
        <FadeUp className="cta-content">
          <span className="section-label">▸ Próximo paso</span>
          <h2>¿Listo para liderar<br /><span>su mercado?</span></h2>
          <p>Transformamos su posicionamiento comercial y documentación técnica en activos corporativos de alto rendimiento.</p>
          <div className="cta-info">
            <div className="cta-info-item"><span className="cta-icon">✉</span> contacto@strategicconnex.com</div>
            <div className="cta-info-item"><span className="cta-icon">📍</span> Operaciones en Neuquén Capital y soporte técnico para bases en Añelo.</div>
          </div>
        </FadeUp>
        <FadeUp className="cta-form-container" delay={0.2} style={{ position: "relative" }}>
          <form className="corporate-form" id="contactForm" autoComplete="off" onSubmit={handleForm}>
            {/* Campo honeypot oculto anti-spam */}
            <div style={{ display: 'none' }} aria-hidden="true">
              <input 
                type="text" 
                name="website" 
                tabIndex={-1} 
                autoComplete="off" 
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <input 
                  type="text" 
                  id="name" 
                  name="name" 
                  required 
                  placeholder=" " 
                  minLength={3} 
                  onMouseEnter={() => setHovering(true)} 
                  onMouseLeave={() => setHovering(false)} 
                />
                <label htmlFor="name">Nombre completo</label>
                <div className="input-line"></div>
              </div>
              <div className="form-group">
                <input 
                  type="text" 
                  id="company" 
                  name="company" 
                  required 
                  placeholder=" " 
                  minLength={2} 
                  onMouseEnter={() => setHovering(true)} 
                  onMouseLeave={() => setHovering(false)} 
                />
                <label htmlFor="company">Organización</label>
                <div className="input-line"></div>
              </div>
            </div>
            <div className="form-group">
              <input 
                type="email" 
                id="email" 
                name="email" 
                required 
                placeholder=" " 
                pattern="[a-z0-9._%+\\-]+@[a-z0-9.\\-]+\\.[a-z]{2,}$" 
                onMouseEnter={() => setHovering(true)} 
                onMouseLeave={() => setHovering(false)} 
              />
              <label htmlFor="email">Correo corporativo</label>
              <div className="input-line"></div>
            </div>
            <div className="form-group">
              <textarea 
                id="message" 
                name="message" 
                rows={3} 
                required 
                placeholder=" " 
                minLength={10} 
                onMouseEnter={() => setHovering(true)} 
                onMouseLeave={() => setHovering(false)}
              ></textarea>
              <label htmlFor="message">Requerimiento principal</label>
              <div className="input-line"></div>
            </div>
            <button 
              type="submit" 
              className="btn-primary btn-submit" 
              aria-live="polite" 
              onMouseEnter={() => setHovering(true)} 
              onMouseLeave={() => setHovering(false)} 
              style={{ background: formStatus === 'done' ? '#22c55e' : 'var(--gold)' }}
            >
              <span>{formStatus === 'idle' ? '▶ Enviar Solicitud' : formStatus === 'processing' ? 'Procesando...' : '✓ Solicitud Recibida'}</span>
            </button>
          </form>
        </FadeUp>
      </div>
    </section>
  );
}
