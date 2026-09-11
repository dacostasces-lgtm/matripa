import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Client anonyme sans cookies, pour les routes qui ne dépendent d'aucune
 * session : sitemap, flux, pages entièrement publiques.
 *
 * Lire les cookies rendrait la route dynamique et empêcherait toute mise en
 * cache — inutile ici, où seules des données publiques sont interrogées.
 */
export const createPublicClient = () =>
  createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
