import type { MetadataRoute } from "next";

import { createPublicClient } from "@/lib/supabase/public";
import { CATEGORIES, CITIES } from "@/types/listing";

/** Régénéré au plus une fois par heure : le catalogue bouge peu. */
export const revalidate = 3600;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createPublicClient();

  // RLS limite déjà la lecture aux annonces publiées : un brouillon ne peut
  // pas se retrouver dans le sitemap.
  const { data } = await supabase
    .from("listings")
    .select("slug, created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(5000)
    .returns<{ slug: string; created_at: string }[]>();

  const listings: MetadataRoute.Sitemap = (data ?? []).map((listing) => ({
    url: `${siteUrl}/annonces/${listing.slug}`,
    lastModified: new Date(listing.created_at),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // Les pages de filtres par ville et par catégorie sont des points d'entrée
  // légitimes : elles répondent à des recherches réelles (« villa Brazzaville »).
  const facets: MetadataRoute.Sitemap = [
    ...CITIES.map((city) => ({
      url: `${siteUrl}/?city=${city.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    ...CATEGORIES.map((category) => ({
      url: `${siteUrl}/?category=${category.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.5,
    })),
  ];

  return [
    { url: siteUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    ...facets,
    ...listings,
  ];
}
