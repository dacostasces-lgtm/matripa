/** Hors du module `"use server"`, qui ne peut exporter que des fonctions async. */
export interface ReviewFormState {
  status: "idle" | "success" | "error";
  message: string | null;
}

export const INITIAL_REVIEW_STATE: ReviewFormState = { status: "idle", message: null };
