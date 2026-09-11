import { execFileSync } from "node:child_process";

const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const API = "http://127.0.0.1:54321";

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
export default function globalSetup() {
  execFileSync("supabase", ["db", "reset"], { stdio: "inherit" });

  // `db reset` recrée le schéma storage : le bucket doit être reposé, sinon
  // tout téléversement échoue en 404.
  execFileSync("curl", [
    "-s", "-o", "/dev/null",
    "-X", "POST", `${API}/storage/v1/bucket`,
    "-H", `apikey: ${SERVICE_KEY}`,
    "-H", `Authorization: Bearer ${SERVICE_KEY}`,
    "-H", "Content-Type: application/json",
    "-d", '{"id":"listings","name":"listings","public":true}',
  ]);
}
