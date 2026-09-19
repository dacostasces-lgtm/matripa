import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";

import { SiteFooter } from "@/components/legal/SiteFooter";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { AgeGate } from "@/components/ui/AgeGate";
import { PanicButton } from "@/components/ui/PanicButton";
import { NavigationBar } from "@/components/ui/NavigationBar";
import { AGE_GATE_SCRIPT } from "@/lib/age-gate";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/**
 * Serif de titrage. Un night mode « luxe » se joue autant sur la lettre que
 * sur la couleur : la grotesque seule fait produit tech, la didone seule fait
 * illisible. On garde donc Inter pour tout le corps et l'interface, et on
 * réserve la serif aux h1/h2 et aux montants — là où l'œil s'arrête.
 */
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Matripa — Rencontres & annonces d'exception",
    template: "%s | Matripa",
  },
  description:
    "Profils vérifiés et prestations de qualité à Brazzaville, Pointe-Noire et au Congo.",
  // `manifest.ts` sert /manifest.webmanifest ; Next l'injecte automatiquement.
  appleWebApp: { capable: true, title: "Matripa", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#020617",
  // La PWA doit couvrir l'encoche et la safe-area sur iOS.
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning` : le script ci-dessous pose `data-majeur` sur
    // <html> avant l'hydratation, écart attendu avec le HTML serveur.
    <html lang="fr" className={`${inter.variable} ${cormorant.variable}`} suppressHydrationWarning>
      <head>
        {/* Avant tout affichage : masque l'écran d'âge si la majorité est déjà confirmée. */}
        <script dangerouslySetInnerHTML={{ __html: AGE_GATE_SCRIPT }} />
      </head>
      {/* Marge basse : le dock de navigation flotte par-dessus la fin de page. */}
      <body className="bg-surface pb-[calc(6rem+env(safe-area-inset-bottom))] font-sans text-slate-100 antialiased">
        <NavigationBar />
        {children}
        <SiteFooter />
        <ServiceWorkerRegistration />
        <AgeGate />
        <PanicButton />
      </body>
    </html>
  );
}
