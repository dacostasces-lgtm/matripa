import { defineConfig, devices } from "@playwright/test";

/**
 * Les tests de bout en bout s'exécutent contre la **stack Supabase locale**,
 * jamais contre le projet distant : ils créent des comptes, déposent des
 * demandes et publient des annonces. Prérequis :
 *
 *   supabase start && supabase db reset
 *
 * Les clés ci-dessous sont les clés de démonstration publiques de Supabase,
 * identiques sur toutes les installations locales.
 */
const LOCAL_SUPABASE = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
  NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3210",
  REQUEST_WEBHOOK_SECRET: "secret-e2e-non-sensible",
};

const PORT = 3210;

export default defineConfig({
  testDir: "./e2e",
  // Repart du seed à chaque exécution : voir e2e/global-setup.ts.
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false, // Les tests partagent une base : on évite les courses.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    /*
     * Purger le cache de données est indispensable : les entrées
     * `unstable_cache` survivent aux rebuilds et ne portent pas
     * l'environnement dans leur clé. Sans purge, un build lancé sur le projet
     * distant laisse des réponses que la suite locale resservirait — les
     * comptages deviennent alors incohérents et très difficiles à diagnostiquer.
     *
     * On ne vise que `fetch-cache`, pas tout `.next/cache` : ce dernier
     * contient aussi la police Google téléchargée par `next/font`, dont la
     * suppression rend le build dépendant du réseau et le fait échouer hors
     * ligne.
     *
     * Build de production plutôt que `next dev` : c'est le comportement réel
     * qui nous intéresse, cache et Server Actions compris.
     */
    command: `rm -rf .next/cache/fetch-cache && npx next build && npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: LOCAL_SUPABASE,
  },
});
