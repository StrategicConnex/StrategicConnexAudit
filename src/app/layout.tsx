import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SCAUDIT | Enterprise Network Intelligence & Security",
  description: "Plataforma avanzada de inteligencia de red, monitoreo de superficie de ataque y auditoría de ciberseguridad continua.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "SCAUDIT | Enterprise Network Intelligence",
    description: "Plataforma avanzada de inteligencia de red, monitoreo de superficie de ataque y auditoría de ciberseguridad continua.",
    type: "website",
    siteName: "SCAUDIT Pro",
  },
  twitter: {
    card: "summary_large_image",
    title: "SCAUDIT | Enterprise Network Intelligence",
    description: "Monitoreo de superficie de ataque y auditoría de ciberseguridad.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
