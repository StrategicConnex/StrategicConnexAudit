"use client";

import React from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { BackToTop } from "@/components/layout/BackToTop";
import { CustomCursor } from "@/components/layout/CustomCursor";
import { FloatingWP } from "@/components/layout/FloatingWP";
import { FadeUp } from "@/components/ui/FadeUp";
import { Shield, Eye, Lock, RefreshCw, CheckCircle } from "lucide-react";

export default function PrivacyPage() {

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
        "name": "Política de Privacidad",
        "item": "https://www.strategicconnex.com.ar/privacy"
      }
    ]
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      
      <div className="global-page-bg" aria-hidden={true}>
        <div className="hero-grid"></div>
        <div className="hero-glow"></div>
      </div>
      
      <Navbar />
      
      <main className="min-h-screen pt-32 pb-24 font-inter text-gray-300">
        <div className="container mx-auto px-6 max-w-4xl">
          
          {/* HEADER */}
          <div className="text-center mb-16">
            <FadeUp>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold/10 border border-gold/30 text-gold-light text-xs font-semibold font-montserrat tracking-widest uppercase mb-4">
                <Shield className="w-3.5 h-3.5 animate-pulse" />
                MARCO LEGAL DE PRIVACIDAD
              </div>
              <h1 className="text-4xl md:text-5xl font-montserrat font-black text-white tracking-tight leading-none">
                Política de <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold via-gold-light to-gold-dark">Privacidad</span>
              </h1>
              <p className="text-sm text-gray-500 mt-4 max-w-lg mx-auto font-medium">
                Última actualización: 10 de Mayo, 2026. Conforme a Ley Nº 25.326 (Argentina) y Reglamento General de Protección de Datos (GDPR - UE).
              </p>
            </FadeUp>
          </div>

          {/* KEY HIGHLIGHTS */}
          <FadeUp delay={0.1}>
            <div className="grid md:grid-cols-3 gap-4 mb-12">
              <div className="p-5 rounded-2xl bg-[#0b0c0e]/80 border border-white/5 flex flex-col gap-3">
                <div className="p-2 w-fit rounded-xl bg-gold/10 text-gold-light">
                  <Eye className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white font-montserrat">Transparencia Total</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Detallamos qué datos recopilamos de forma automatizada mediante cookies y cuáles nos provees directamente.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#0b0c0e]/80 border border-white/5 flex flex-col gap-3">
                <div className="p-2 w-fit rounded-xl bg-gold/10 text-gold-light">
                  <Lock className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white font-montserrat">Seguridad de Datos</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Cifrado extremo en reposo y en tránsito. Protección activa de tus datos de contacto corporativo.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#0b0c0e]/80 border border-white/5 flex flex-col gap-3">
                <div className="p-2 w-fit rounded-xl bg-gold/10 text-gold-light">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white font-montserrat">Control de Cookies</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Configura tus preferencias en cualquier momento. Control absoluto sobre tus datos estadísticos.
                </p>
              </div>
            </div>
          </FadeUp>

          {/* POLICY BODY */}
          <FadeUp delay={0.2}>
            <div className="bg-[#0b0c0e]/60 backdrop-blur-md border border-white/5 rounded-3xl p-6 md:p-10 space-y-10 leading-relaxed text-sm">
              
              {/* SECTION 1 */}
              <section className="space-y-4">
                <h2 className="text-xl font-bold text-white font-montserrat border-b border-white/5 pb-2 flex items-center gap-2">
                  <span className="text-gold font-mono text-base">01.</span> Introducción y Responsable de Tratamiento
                </h2>
                <p>
                  Bienvenido a <strong>StrategicConnex</strong> (el &quot;Sitio&quot;). El respeto por tu privacidad y la seguridad técnica de tus datos de navegación son de máxima prioridad para nuestra agencia. De acuerdo con las disposiciones de la <strong>Ley de Protección de Datos Personales de la República Argentina Nº 25.326</strong> (LPDP) y del <strong>Reglamento General de Protección de Datos de la Unión Europea</strong> (GDPR - Reglamento UE 2016/679), informamos detalladamente cómo recopilamos, procesamos, almacenamos y protegemos la información personal y de rastreo técnico de nuestros usuarios.
                </p>
                <p className="text-gray-400">
                  El responsable del tratamiento de los datos personales recopilados a través de este Sitio es StrategicConnex, una agencia dedicada a servicios profesionales de posicionamiento web, SEO técnico y consultoría estratégica de marketing digital corporativo.
                </p>
              </section>

              {/* SECTION 2 */}
              <section className="space-y-4">
                <h2 className="text-xl font-bold text-white font-montserrat border-b border-white/5 pb-2 flex items-center gap-2">
                  <span className="text-gold font-mono text-base">02.</span> Datos que Recopilamos y Finalidad
                </h2>
                <p>
                  Recopilamos dos tipos de datos mediante la interacción directa e indirecta en nuestro sitio web:
                </p>
                <ul className="space-y-3 pl-4 border-l border-gold/30">
                  <li>
                    <strong className="text-white">Datos de Navegación y Cookies Técnicas (Automatizado):</strong> 
                    <span className="block text-xs text-gray-400 mt-1">
                      Dirección IP anonimizada, sistema operativo, tipo de navegador, procedencia del tráfico y patrones de comportamiento técnico dentro del Sitio. Estos datos se procesan con fines puramente estadísticos y de rendimiento (a través de Google Analytics y herramientas técnicas similares) si otorgas el consentimiento explícito.
                    </span>
                  </li>
                  <li>
                    <strong className="text-white">Datos Proporcionados por el Usuario (Voluntario):</strong>
                    <span className="block text-xs text-gray-400 mt-1">
                      Nombre, dirección de correo electrónico, teléfono, empresa y detalles del proyecto que nos envías de forma voluntaria a través de nuestros canales de contacto, correos corporativos o formularios de auditoría SEO.
                    </span>
                  </li>
                </ul>
                <p className="text-xs text-gold-light italic">
                  * No almacenamos, tratamos ni recopilamos datos de carácter sensible, financiero o médico en este Sitio.
                </p>
              </section>

              {/* SECTION 3 */}
              <section className="space-y-4">
                <h2 className="text-xl font-bold text-white font-montserrat border-b border-white/5 pb-2 flex items-center gap-2">
                  <span className="text-gold font-mono text-base">03.</span> Base Legal para el Tratamiento de Datos
                </h2>
                <p>
                  Procesamos tus datos bajo las siguientes bases legales sólidas:
                </p>
                <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-2">
                  <p className="text-xs">
                    <strong className="text-white">Consentimiento Explícito:</strong> Para el uso de cookies analíticas y de marketing de terceros, así como para la respuesta a consultas que nos envías directamente. Puedes retirar o modificar este consentimiento en cualquier momento mediante nuestro configurador de cookies.
                  </p>
                  <p className="text-xs">
                    <strong className="text-white">Relación Precontractual o Contractual:</strong> Para la provisión de cotizaciones de servicios de posicionamiento SEO técnico solicitados por el usuario.
                  </p>
                  <p className="text-xs">
                    <strong className="text-white">Interés Legítimo Técnico:</strong> Para garantizar la seguridad del sitio web, prevenir ataques de denegación de servicio (DDoS) y mantener el rendimiento del servidor en óptimas condiciones.
                  </p>
                </div>
              </section>

              {/* SECTION 4 */}
              <section className="space-y-4">
                <h2 className="text-xl font-bold text-white font-montserrat border-b border-white/5 pb-2 flex items-center gap-2">
                  <span className="text-gold font-mono text-base">04.</span> Derechos del Usuario (ARCO & GDPR)
                </h2>
                <p>
                  Como titular de los datos personales, tienes garantizados por la legislación argentina (Ley 25.326, Art. 14, 15, 16) y por el reglamento GDPR los derechos de:
                </p>
                <div className="grid sm:grid-cols-2 gap-3 text-xs">
                  {[
                    { title: "Acceso y Consulta", text: "Solicitar información detallada sobre si tratamos tus datos personales y obtener copia de ellos." },
                    { title: "Rectificación y Actualización", text: "Corregir inexactitudes o actualizar datos incompletos en nuestras bases." },
                    { title: "Cancelación y Eliminación", text: "Exigir el borrado definitivo de tus registros una vez que finalice el propósito de tratamiento." },
                    { title: "Oposición y Limitación", text: "Oponerte al uso con fines estadísticos o de personalización publicitaria." }
                  ].map((derecho, idx) => (
                    <div key={idx} className="p-3.5 rounded-xl bg-black/40 border border-white/5 flex gap-2">
                      <CheckCircle className="w-4 h-4 text-gold flex-shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-white block mb-0.5">{derecho.title}</strong>
                        <span className="text-gray-400">{derecho.text}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Para ejercer cualquiera de tus derechos de acceso, rectificación, cancelación u oposición, ponte en contacto con nosotros escribiéndonos al correo corporativo: <span className="text-gold font-semibold">privacidad@strategicconnex.com.ar</span> detallando tu solicitud y adjuntando acreditación de identidad conforme lo exige la autoridad reguladora de control (AAIP).
                </p>
              </section>

              {/* SECTION 5 */}
              <section className="space-y-4">
                <h2 className="text-xl font-bold text-white font-montserrat border-b border-white/5 pb-2 flex items-center gap-2">
                  <span className="text-gold font-mono text-base">05.</span> Uso y Configuración de Cookies
                </h2>
                <p>
                  Este Sitio utiliza cookies propias para recordar tus preferencias y cookies analíticas y de marketing de terceros (como Google Analytics) que recopilan información anonimizada de rendimiento y conversión técnica.
                </p>
                <p>
                  Puedes revocar en cualquier momento tu consentimiento, borrar las cookies guardadas en tu navegador o configurar de forma selectiva cuáles permites mediante el botón de <strong className="text-white">Control de Cookies</strong> flotante ubicado en el margen inferior de nuestro Sitio web.
                </p>
              </section>

              {/* SECTION 6 */}
              <section className="space-y-4">
                <h2 className="text-xl font-bold text-white font-montserrat border-b border-white/5 pb-2 flex items-center gap-2">
                  <span className="text-gold font-mono text-base">06.</span> Seguridad y Almacenamiento de Datos
                </h2>
                <p>
                  Adoptamos rigurosas medidas de seguridad técnicas, organizativas y físicas para proteger la confidencialidad de tus datos, impidiendo alteraciones, pérdidas, consultas o accesos no autorizados. 
                </p>
                <p>
                  Toda la comunicación de datos entre el navegador del usuario y nuestro servidor está totalmente cifrada mediante el protocolo criptográfico <strong className="text-white">HTTPS/TLS</strong> de nivel industrial. Los datos se almacenan en servidores seguros alojados en infraestructuras de nube de alto rendimiento que cumplen de forma auditable con los principales estándares de seguridad globales (ISO 27001, SOC 2).
                </p>
              </section>

              {/* SECTION 7 */}
              <section className="space-y-4">
                <h2 className="text-xl font-bold text-white font-montserrat border-b border-white/5 pb-2 flex items-center gap-2">
                  <span className="text-gold font-mono text-base">07.</span> Modificaciones a esta Política
                </h2>
                <p>
                  StrategicConnex se reserva el derecho de modificar o actualizar esta Política de Privacidad de forma periódica para adaptarla a nuevos requerimientos regulatorios, evoluciones algorítmicas de seguridad o cambios metodológicos en el Sitio. Te recomendamos revisar de forma regular esta página para mantenerte informado sobre cómo protegemos tu información.
                </p>
              </section>
            </div>
          </FadeUp>
          
        </div>
      </main>
      
      <Footer />
      <BackToTop />
      <CustomCursor />
      <FloatingWP />
    </>
  );
}
