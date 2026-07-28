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

export default function PosicionamientoWebPage() {
  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": "Posicionamiento Web Estratégico",
    "description": "Estrategias de posicionamiento SEO de alto impacto orientadas a la captación de clientes y conversión orgánica en buscadores.",
    "provider": {
      "@type": "Organization",
      "name": "StrategicConnex",
      "url": "https://www.strategicconnex.com.ar"
    },
    "serviceType": "Search Engine Optimization",
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
        "name": "Posicionamiento Web",
        "item": "https://www.strategicconnex.com.ar/posicionamiento-web"
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
          <Breadcrumbs items={[{ name: "Posicionamiento Web" }]} />
        </div>
        <section className="container mx-auto px-6 py-10">
          <FadeUp>
            <span className="section-label">▸ Servicios SEO</span>
            <h1 className="main-title mb-8">Servicio de Posicionamiento Web en Google</h1>
            <p className="section-desc max-w-3xl mb-12">
              Transformamos tu sitio web en una máquina de captación de clientes. No solo buscamos tráfico, buscamos resultados que impacten en tu facturación mediante estrategias SEO de alta precisión.
            </p>
          </FadeUp>

          <div className="grid md:grid-cols-2 gap-12 mt-20">
            <FadeUp delay={0.1} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">¿Qué incluye nuestro servicio SEO?</h2>
              <p className="text-gray-400 leading-relaxed">
                Nuestra metodología abarca desde la base técnica hasta la autoridad de marca, asegurando un crecimiento orgánico sostenible y resistente a las actualizaciones de algoritmos.
              </p>
            </FadeUp>

            <FadeUp delay={0.2} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">Auditoría técnica completa</h2>
              <p className="text-gray-400 leading-relaxed">
                Analizamos más de 100 puntos críticos: Core Web Vitals, arquitectura de URLs, indexabilidad, semántica HTML y rendimiento para asegurar una base sólida.
              </p>
            </FadeUp>

            <FadeUp delay={0.3} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">Optimización On-Page</h2>
              <p className="text-gray-400 leading-relaxed">
                Alineamos tu contenido con la intención de búsqueda del usuario. Optimizamos títulos, metas, encabezados y la estructura de datos para maximizar el CTR.
              </p>
            </FadeUp>

            <FadeUp delay={0.4} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">Estrategia de contenido</h2>
              <p className="text-gray-400 leading-relaxed">
                Creamos activos digitales que resuelven problemas reales. Contenido optimizado que atrae, educa y convierte visitantes en leads calificados.
              </p>
            </FadeUp>

            <FadeUp delay={0.5} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">Resultados medibles</h2>
              <p className="text-gray-400 leading-relaxed">
                Transparencia total. Proporcionamos tableros en tiempo real para trackear posiciones, tráfico orgánico y conversiones directas de canal SEO.
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
