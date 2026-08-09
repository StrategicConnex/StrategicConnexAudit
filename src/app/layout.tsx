import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, JetBrains_Mono, DM_Sans } from "next/font/google";
import "./globals.css";
import { ToasterProvider } from "@/app/components/ToasterProvider";
import { I18nProvider } from "@/app/components/I18nProvider";
import { RegisterServiceWorker } from "@/app/components/RegisterServiceWorker";
import { ThemeProvider, themeInitScript } from "@/shared/design-system";


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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Nonce per-request generado por src/proxy.ts (vía header x-csp-nonce).
  // Se usa en la meta CSP para que el nonce aplique incluso en el caso
  // (teórico) de que el header HTTP del proxy no llegue a la página.
  const nonce = (await headers()).get("x-csp-nonce") || undefined;
  const isDev = process.env.NODE_ENV === "development";

  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} ${dmSans.variable} h-full antialiased`}
    >
      <head>
        {/**
         * CSP via <meta> tag — defense-in-depth, mirroring the header set by
         * src/proxy.ts with the SAME per-request nonce (read above).
         * When both a header and a meta CSP exist, browsers enforce BOTH, so
         * this meta can never weaken the header policy; it only guarantees a
         * strict policy if the proxy header were ever absent. script-src
         * deliberately has no 'unsafe-inline' (it would disable the nonce).
         */}
        {nonce ? (
          <meta
            httpEquiv="Content-Security-Policy"
            content={`default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; object-src 'none'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co; base-uri 'self'; form-action 'self'`}
          />
        ) : null}
        <link rel="manifest" href="/manifest.json" />
        {/**
         * Theme anti-FOUC — corre antes del paint y fija data-theme en <html>.
         * Lleva el nonce CSP (igual que la meta CSP): sin nonce no se inyecta
         * (fallback: el provider aplica la preferencia en el mount).
         */}
        {nonce ? (
          <script
            nonce={nonce}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: themeInitScript }}
          />
        ) : null}
      </head>
      <body className="min-h-full flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-bold"
        >
          Saltar al contenido principal
        </a>
        <RegisterServiceWorker />
        <ThemeProvider>
          <I18nProvider>
            {children}
          </I18nProvider>
        </ThemeProvider>
        <ToasterProvider />
      </body>
    </html>
  );
}
