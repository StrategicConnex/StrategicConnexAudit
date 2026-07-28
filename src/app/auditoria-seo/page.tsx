"use client";
import React from "react";
import dynamic from "next/dynamic";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { BackToTop } from "@/components/layout/BackToTop";
import { CustomCursor } from "@/components/layout/CustomCursor";
import { FloatingWP } from "@/components/layout/FloatingWP";
import { FadeUp } from "@/components/ui/FadeUp";
import { CTA } from "@/components/sections/CTA";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

const EnergyTrails3D = dynamic(
  () => import("@/components/ui/EnergyTrails3D").then((mod) => mod.EnergyTrails3D),
  { ssr: false }
);

export default function AuditoriaSeoPage() {
  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": "Auditoría SEO Técnica",
    "description": "Análisis profundo de arquitectura web, rastreabilidad, Core Web Vitals e indexabilidad para un diagnóstico preciso de posicionamiento.",
    "provider": {
      "@type": "Organization",
      "name": "StrategicConnex",
      "url": "https://www.strategicconnex.com.ar"
    },
    "serviceType": "Technical SEO Audit",
    "areaServed": {
      "@type": "Country",
      "name": "Argentina"
    }
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Inicio",
        "item": "https://www.strategicconnex.com.ar"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Auditoría SEO",
        "item": "https://www.strategicconnex.com.ar/auditoria-seo"
      }
    ]
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <div className="global-page-bg" aria-hidden={true}>
        <div className="hero-grid"></div>
        <div className="hero-glow"></div>
        <EnergyTrails3D />
      </div>
      <Navbar />
      <main className="pt-32">
        <div className="container mx-auto px-6">
          <Breadcrumbs items={[{ name: "Auditoría SEO" }]} />
        </div>
        <section className="container mx-auto px-6 py-10">
          <FadeUp>
            <span className="section-label">▸ Análisis Técnico</span>
            <h1 className="main-title mb-8">Auditoría SEO Técnica & Diagnóstico Avanzado</h1>
            <p className="section-desc max-w-3xl mb-12">
              Detectamos los errores invisibles que impiden tu crecimiento en Google. Una auditoría técnica es el primer paso crítico para cualquier estrategia SEO seria.
            </p>
          </FadeUp>

          <div className="grid md:grid-cols-2 gap-12 mt-20">
            <FadeUp delay={0.1} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">Rastreo e Indexabilidad</h2>
              <p className="text-gray-400 leading-relaxed">
                Verificamos que Google pueda encontrar y entender cada página importante de tu sitio, optimizando el presupuesto de rastreo (Crawl Budget).
              </p>
            </FadeUp>

            <FadeUp delay={0.2} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">Core Web Vitals & WPO</h2>
              <p className="text-gray-400 leading-relaxed">
                Analizamos el rendimiento de carga, interactividad y estabilidad visual para cumplir con los estándares de experiencia de usuario de Google.
              </p>
            </FadeUp>

            <FadeUp delay={0.3} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">Arquitectura de Información</h2>
              <p className="text-gray-400 leading-relaxed">
                Evaluamos la jerarquía de tus contenidos y el enlazado interno para distribuir la autoridad (link equity) de forma eficiente.
              </p>
            </FadeUp>

            <FadeUp delay={0.4} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">Checklist de 120+ Puntos</h2>
              <p className="text-gray-400 leading-relaxed">
                Desde certificados SSL hasta etiquetas hreflang y canonización. No dejamos ningún detalle técnico librado al azar.
              </p>
            </FadeUp>
          </div>
        </section>
        <CTA />
      </main>
      <Footer />
      <FloatingWP />
      <BackToTop />
      <CustomCursor />
    </>
  );
}
