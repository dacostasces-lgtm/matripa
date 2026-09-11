import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Client à privilèges élevés : la clé `service_role` contourne toutes les
 * policies RLS.
 *
 * À n'utiliser que dans du code strictement serveur (webhooks, tâches
 * planifiées, back-office). L'import de `server-only` fait échouer la
 * compilation si ce module se retrouve dans un bundle client — la clé ne doit
 * jamais porter le préfixe `NEXT_PUBLIC_`.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY est absent de l'environnement.");
  }

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
