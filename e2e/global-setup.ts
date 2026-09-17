import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

import { ADMIN_EMAIL, API, SERVICE_KEY, TEST_PASSWORD } from "./constants";

/**
 * Remet la base locale à l'état du seed avant chaque exécution.
 *
 * Sans cela, les offres, comptes et demandes créés par la suite s'accumulent
 * d'une exécution à l'autre : les comptages dérivent, la pagination finit par
 * masquer des cartes, et des tests se mettent à échouer pour des raisons sans
 * rapport avec le code. C'est la cause commune de la plupart des instabilités
 * observées sur cette suite — la corriger ici évite d'avoir à durcir chaque
 * assertion une par une.
 */
export default async function globalSetup() {
  execFileSync("supabase", ["db", "reset"], { stdio: "inherit" });

  // `db reset` recrée le schéma storage : le bucket doit être reposé, sinon
  // tout téléversement échoue en 404. Le bucket `verifications`, lui, est créé
  // par la migration 0010.
  execFileSync("curl", [
    "-s", "-o", "/dev/null",
    "-X", "POST", `${API}/storage/v1/bucket`,
    "-H", `apikey: ${SERVICE_KEY}`,
    "-H", `Authorization: Bearer ${SERVICE_KEY}`,
    "-H", "Content-Type: application/json",
    "-d", '{"id":"listings","name":"listings","public":true}',
  ]);

  // Compte administrateur : créé par l'API Admin et non par `insert into
  // auth.users` (piège n° 9 du README).
  const admin = createClient(API, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;

  const { error: adminError } = await admin.from("admins").insert({ user_id: data.user.id });
  if (adminError) throw adminError;
}
