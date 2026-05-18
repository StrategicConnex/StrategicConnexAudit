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

export default function SeoTecnicoPage() {
  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": "SEO Técnico Avanzado",
    "description": "Optimización profunda de código, semántica HTML, velocidad WPO, Core Web Vitals e infraestructura del servidor para indexación y ranking de alto impacto.",
    "provider": {
      "@type": "Organization",
      "name": "StrategicConnex",
      "url": "https://www.strategicconnex.com.ar"
    },
    "serviceType": "Technical Search Engine Optimization",
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
        "name": "SEO Técnico",
        "item": "https://www.strategicconnex.com.ar/seo-tecnico"
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
          <Breadcrumbs items={[{ name: "SEO Técnico" }]} />
        </div>
        <section className="container mx-auto px-6 py-10">
          <FadeUp>
            <span className="section-label">▸ Optimización de Código</span>
            <h1 className="main-title mb-8">SEO Técnico: La Ciencia Detrás del Ranking</h1>
            <p className="section-desc max-w-3xl mb-12">
              Un sitio web rápido, accesible y semánticamente perfecto es el requisito mínimo para dominar las SERPs. Optimizamos tu arquitectura digital para humanos y algoritmos.
            </p>
          </FadeUp>

          <div className="grid md:grid-cols-2 gap-12 mt-20">
            <FadeUp delay={0.1} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">Semántica HTML5 & ARIA</h2>
              <p className="text-gray-400 leading-relaxed">
                Implementamos una estructura de etiquetas coherente que facilita la lectura de los bots de Google y mejora la accesibilidad global.
              </p>
            </FadeUp>

            <FadeUp delay={0.2} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">Datos Estructurados (JSON-LD)</h2>
              <p className="text-gray-400 leading-relaxed">
                Inyectamos marcado de esquema avanzado para obtener &quot;Rich Results&quot; (fragmentos enriquecidos) y aumentar el CTR en los resultados de búsqueda.
              </p>
            </FadeUp>

            <FadeUp delay={0.3} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">Optimización de Imágenes & Media</h2>
              <p className="text-gray-400 leading-relaxed">
                Formatos de próxima generación (WebP/AVIF), lazy-loading inteligente y compresión sin pérdida para mantener la velocidad al máximo.
              </p>
            </FadeUp>

            <FadeUp delay={0.4} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">Server Side Rendering (SSR)</h2>
              <p className="text-gray-400 leading-relaxed">
                Aprovechamos las capacidades de Next.js para entregar contenido renderizado desde el servidor, garantizando una indexación instantánea y precisa.
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
