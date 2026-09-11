import type { MetadataRoute } from "next";

/**
 * Manifeste typé (remplace `public/manifest.webmanifest`) : Next le sert sur
 * `/manifest.webmanifest` et vérifie la forme à la compilation.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Matripa — Rencontres & annonces d'exception",
    short_name: "Matripa",
    description:
      "Profils vérifiés et prestations de qualité au Congo.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#09090b",
    theme_color: "#09090b",
    categories: ["lifestyle", "social", "dating"],
    icons: [
      { src: "/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Brazzaville", url: "/?city=brazzaville" },
      { name: "Pointe-Noire", url: "/?city=pointe-noire" },
    ],
  };
}
