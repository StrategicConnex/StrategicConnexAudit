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
  title: "Strategic Connex | Consultora Industrial Neuquén - Vaca Muerta",
  description: "La única Consultora Industrial en Neuquén que fusiona Marketing, Control Documental Hidrocarburos e IT. Liderazgo B2B en Vaca Muerta.",
  keywords: ["Consultora Industrial Neuquén", "Vaca Muerta", "Control Documental Hidrocarburos", "Oil and Gas", "Marketing B2B"],
  robots: "index, follow",
  alternates: {
    canonical: "https://strategicconnex.com",
  },
  openGraph: {
    title: "Strategic Connex | La Primera Opción en Vaca Muerta",
    description: "Profesionalizando a Pymes de la Cuenca Neuquina con infraestructura operativa B2B de alto rendimiento.",
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
