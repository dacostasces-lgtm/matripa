/**
 * Constantes partagées par `global-setup.ts` et les tests. Ce module n'importe
 * pas `@playwright/test` : il peut être chargé par le setup global.
 *
 * Clés de démonstration publiques de Supabase, identiques sur toute stack locale.
 */
export const API = "http://127.0.0.1:54321";

export const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export const TEST_PASSWORD = "MotDePasseE2E2026!";

export const ADMIN_EMAIL = "admin-e2e@matripa.test";
