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
  title: "Strategic Connex | Soluciones Estratégicas",
  description: "La única Consultora Industrial en Neuquén que fusiona Marketing, Control Documental Hidrocarburos e IT. Liderazgo B2B en Vaca Muerta.",
  keywords: ["Consultora Industrial Neuquén", "Vaca Muerta", "Control Documental Hidrocarburos", "Oil and Gas", "Marketing B2B"],
  robots: "index, follow",
  alternates: {
    canonical: "https://strategicconnex.vercel.app",
  },
  openGraph: {
    title: "Strategic Connex | La Primera Opción en Vaca Muerta",
    description: "Profesionalizando a Pymes de la Cuenca Neuquina con infraestructura operativa B2B de alto rendimiento.",
    url: "https://strategicconnex.vercel.app",
    siteName: "Strategic Connex",
    images: [
      {
        url: "/images/marketing_digital_1775961023662.png", 
        width: 1200,
        height: 630,
        alt: "Strategic Connex B2B Dashboard Analytics"
      }
    ],
    locale: "es_AR",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Strategic Connex | Posicionamiento Estratégico",
    description: "Liderazgo comercial e inteligencia para ecosistemas y rubros energéticos.",
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
    "name": "Strategic Connex",
    "description": "Consultora Industrial especializada en Marketing Digital B2B, Control Documental de Hidrocarburos y Soluciones IT para Vaca Muerta.",
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
      "name": "Servicios Industriales",
      "itemListElement": [
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Marketing Digital Industrial B2B",
            "description": "Posicionamiento estratégico y generación de demanda para empresas del sector energético."
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Control Documental de Hidrocarburos",
            "description": "Gestión técnica de documentación y homologación para operadoras y proveedores de Vaca Muerta."
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
