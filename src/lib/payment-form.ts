/** Hors du module `"use server"`, qui ne peut exporter que des fonctions async. */
export interface PaymentFormState {
  status: "idle" | "processing" | "error";
  message: string | null;
}

export const INITIAL_PAYMENT_STATE: PaymentFormState = { status: "idle", message: null };
