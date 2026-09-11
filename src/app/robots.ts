import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Espaces authentifiés et parcours transactionnel : aucun intérêt à les
      // indexer, et `/demande/` contient un formulaire de coordonnées.
      disallow: ["/partenaire/", "/admin/", "/demande/", "/connexion", "/api/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
