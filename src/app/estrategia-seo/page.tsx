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

export default function EstrategiaSeoPage() {
  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": "Estrategia SEO Avanzada",
    "description": "Planificación y diseño de rutas de crecimiento orgánico continuo: Keyword Research avanzado, análisis de competidores, Topic Clusters y Silos.",
    "provider": {
      "@type": "Organization",
      "name": "StrategicConnex",
      "url": "https://www.strategicconnex.com.ar"
    },
    "serviceType": "SEO Strategy and Growth",
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
        "name": "Estrategia SEO",
        "item": "https://www.strategicconnex.com.ar/estrategia-seo"
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
          <Breadcrumbs items={[{ name: "Estrategia SEO" }]} />
        </div>
        <section className="container mx-auto px-6 py-10">
          <FadeUp>
            <span className="section-label">▸ Planificación de Crecimiento</span>
            <h1 className="main-title mb-8">Estrategia SEO Avanzada: Tu Hoja de Ruta al Éxito</h1>
            <p className="section-desc max-w-3xl mb-12">
              El SEO no es una acción puntual, es una estrategia continua de dominio de mercado. Diseñamos planes personalizados que alinean tus objetivos de negocio con las demandas de búsqueda.
            </p>
          </FadeUp>

          <div className="grid md:grid-cols-2 gap-12 mt-20">
            <FadeUp delay={0.1} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">Keyword Research de Intención</h2>
              <p className="text-gray-400 leading-relaxed">
                Identificamos no solo qué busca tu cliente, sino POR QUÉ lo busca. Atacamos términos transaccionales e informacionales para cubrir todo el funnel de ventas.
              </p>
            </FadeUp>

            <FadeUp delay={0.2} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">Análisis de Competencia</h2>
              <p className="text-gray-400 leading-relaxed">
                Estudiamos el perfil de enlaces, contenido y autoridad de tus competidores para encontrar brechas (gaps) y oportunidades de superación rápida.
              </p>
            </FadeUp>

            <FadeUp delay={0.3} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">Topic Clusters & Silos</h2>
              <p className="text-gray-400 leading-relaxed">
                Estructuramos tu contenido en grupos temáticos que refuerzan tu autoridad temática ante Google, mejorando el ranking de múltiples keywords relacionadas.
              </p>
            </FadeUp>

            <FadeUp delay={0.4} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">Link Building Ético</h2>
              <p className="text-gray-400 leading-relaxed">
                Desarrollamos perfiles de autoridad mediante la obtención de enlaces de calidad, menciones de marca y estrategias de relaciones públicas digitales.
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
