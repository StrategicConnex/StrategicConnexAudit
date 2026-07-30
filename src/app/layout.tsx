import type { Metadata } from "next";
import { Inter, JetBrains_Mono, DM_Sans } from "next/font/google";
import "./globals.css";
import { ToasterProvider } from "@/app/components/ToasterProvider";
import { I18nProvider } from "@/app/components/I18nProvider";


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

const dmSans = DM_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "1000"],
});

export const metadata: Metadata = {
  title: "SCAUDIT | Enterprise Network Intelligence & Security",
  description: "Plataforma avanzada de inteligencia de red, monitoreo de superficie de ataque y auditoría de ciberseguridad continua.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/logo-dark.svg", type: "image/svg+xml", sizes: "any" },
    ],
    apple: "/logo-dark.svg",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "SCAUDIT",
    "mobile-web-app-capable": "yes",
    "application-name": "SCAUDIT",
    "msapplication-TileColor": "#060608",
    "msapplication-TileImage": "/logo-dark.svg",
  },
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
      className={`${inter.variable} ${jetbrainsMono.variable} ${dmSans.variable} h-full antialiased`}
    >
      <head>
        {/**
         * CSP via <meta> tag — defense-in-depth for prerendered/static pages.
         * The proxy.ts also sets CSP via HTTP header, but on some Next.js 16
         * prerendered pages (marked ○), the base-uri and form-action directives
         * from the header are stripped. This meta tag ensures they are always
         * enforced even when the proxy header is incomplete.
         * See also: src/proxy.ts (buildCsp)
         */}
        <meta
          httpEquiv="Content-Security-Policy"
          content={`default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://apifreellm.com https://*.vercel.app; base-uri 'self'; form-action 'self'`}
        />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="min-h-full flex flex-col">
        <I18nProvider>
          {children}
        </I18nProvider>
        <ToasterProvider />
      </body>
    </html>
  );
}
