/** Hors du module `"use server"`, qui ne peut exporter que des fonctions async. */
export interface AuthFormState {
  status: "idle" | "success" | "error";
  message: string | null;
}

export const INITIAL_AUTH_STATE: AuthFormState = { status: "idle", message: null };
