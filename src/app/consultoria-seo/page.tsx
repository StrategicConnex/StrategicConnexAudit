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

export default function ConsultoriaSeoPage() {
  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": "Consultoría SEO Profesional",
    "description": "Asesoramiento, mentoría y consultoría SEO continua de alto impacto. Solución de problemas complejos de indexación, penalizaciones y migraciones de sitios corporativos.",
    "provider": {
      "@type": "Organization",
      "name": "StrategicConnex",
      "url": "https://www.strategicconnex.com.ar"
    },
    "serviceType": "SEO Consulting",
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
        "name": "Consultoría SEO",
        "item": "https://www.strategicconnex.com.ar/consultoria-seo"
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
          <Breadcrumbs items={[{ name: "Consultoría SEO" }]} />
        </div>
        <section className="container mx-auto px-6 py-10">
          <FadeUp>
            <span className="section-label">▸ Mentoría Personalizada</span>
            <h1 className="main-title mb-8">Consultoría SEO: Acompañamiento Estratégico</h1>
            <p className="section-desc max-w-3xl mb-12">
              ¿Necesitas una visión experta para tu proyecto? Nuestra consultoría SEO te brinda el conocimiento técnico y estratégico necesario para tomar decisiones informadas y acelerar resultados.
            </p>
          </FadeUp>

          <div className="grid md:grid-cols-2 gap-12 mt-20">
            <FadeUp delay={0.1} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">Resolución de Problemas Críticos</h2>
              <p className="text-gray-400 leading-relaxed">
                Caídas repentinas de tráfico, penalizaciones de Google o migraciones web complejas. Estamos aquí para resolver los desafíos más difíciles del SEO.
              </p>
            </FadeUp>

            <FadeUp delay={0.2} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">Formación In-house</h2>
              <p className="text-gray-400 leading-relaxed">
                Capacitamos a tu equipo de desarrollo y contenidos en mejores prácticas SEO para que la optimización sea parte del ADN de tu empresa.
              </p>
            </FadeUp>

            <FadeUp delay={0.3} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">SEO para Nuevos Lanzamientos</h2>
              <p className="text-gray-400 leading-relaxed">
                Aseguramos que tus nuevos productos o verticales de negocio nazcan optimizados desde el día cero, evitando retrabajo costoso en el futuro.
              </p>
            </FadeUp>

            <FadeUp delay={0.4} className="service-detail-card p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-gold">Asesoramiento en Herramientas</h2>
              <p className="text-gray-400 leading-relaxed">
                Te ayudamos a elegir y configurar el stack tecnológico SEO adecuado (Search Console, GA4, Semrush, Ahrefs) para un monitoreo profesional.
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
