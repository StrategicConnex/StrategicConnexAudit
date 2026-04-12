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
  metadataBase: new URL("https://strategicconnex.com"),
  title: "Strategic Connex | Inteligencia de Mercado y Posicionamiento B2B",
  description: "Consultoría y documentación técnica de precisión para la industria de operaciones complejas y el sector Oil & Gas. Tableros analíticos, diseño de branding corporativo y prospectos B2B calificados en tiempo real.",
  keywords: ["Oil and Gas", "B2B Marketing", "Documentación Técnica", "Ingeniería Comercial", "Software Analítica B2B"],
  robots: "index, follow",
  alternates: {
    canonical: "https://strategicconnex.com",
  },
  openGraph: {
    title: "Strategic Connex | Inteligencia B2B",
    description: "Multiplica tu tasa de cierre en industrias exigentes con nuestra tecnología de Documentación Técnica Certificada e Ingeniería Comercial B2B.",
    url: "https://strategicconnex.com",
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
  return (
    <html lang="es" className={`${inter.variable} ${montserrat.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
