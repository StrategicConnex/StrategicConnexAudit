import type { Metadata } from "next";
import { Inter, Montserrat } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://strategicconnex.vercel.app"),
  title: "Posicionamiento Web Estratégico | StrategicConnex",
  description: "Agencia SEO especializada en posicionamiento web, auditorías técnicas y crecimiento orgánico. Aumentamos tu visibilidad en Google con estrategias orientadas a resultados.",
  keywords: ["posicionamiento web estratégico", "agencia SEO", "SEO para empresas", "consultoría SEO", "optimización SEO profesional", "auditoría SEO técnica"],
  robots: "index, follow",
  alternates: {
    canonical: "https://strategicconnex.vercel.app",
  },
  openGraph: {
    title: "Posicionamiento Web Estratégico | StrategicConnex",
    description: "Agencia SEO especializada en posicionamiento web, auditorías técnicas y crecimiento orgánico para empresas de alto impacto.",
    url: "https://strategicconnex.vercel.app",
    siteName: "Strategic Connex",
    images: [
      {
        url: "/images/marketing_digital_1775961023662.png", 
        width: 1200,
        height: 630,
        alt: "Strategic Connex | Agencia SEO & Posicionamiento Web"
      }
    ],
    locale: "es_AR",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Posicionamiento Web Estratégico | StrategicConnex",
    description: "Agencia SEO especializada en posicionamiento web y crecimiento orgánico.",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "name": "StrategicConnex",
    "description": "Agencia de posicionamiento web estratégico y marketing digital orientado a resultados. Especialistas en SEO técnico y crecimiento orgánico.",
    "url": "https://strategicconnex.vercel.app",
    "logo": "https://strategicconnex.vercel.app/logo.png",
    "image": "https://strategicconnex.com/images/marketing_digital_1775961023662.png",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Neuquén",
      "addressRegion": "Neuquén",
      "addressCountry": "AR"
    },
    "areaServed": {
      "@type": "GeoCircle",
      "geoMidpoint": {
        "@type": "GeoCoordinates",
        "latitude": -38.9516,
        "longitude": -68.0591
      },
      "geoRadius": "500000"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": -38.9516,
      "longitude": -68.0591
    },
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "Servicios SEO y Marketing Digital",
      "itemListElement": [
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Posicionamiento Web Estratégico",
            "description": "Estrategias personalizadas para alcanzar las primeras posiciones en Google."
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Auditoría SEO Técnica",
            "description": "Análisis profundo de arquitectura web y optimización de rendimiento para buscadores."
          }
        }
      ]
    }
  };

  return (
    <html lang="es" className={`${inter.variable} ${montserrat.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
