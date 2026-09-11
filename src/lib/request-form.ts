/**
 * État du formulaire de demande.
 *
 * Volontairement hors du module `"use server"` : celui-ci ne peut exporter que
 * des fonctions asynchrones. Une constante qui y serait déclarée arriverait
 * `undefined` côté client, et `useActionState` planterait au premier rendu.
 */
export interface RequestFormState {
  status: "idle" | "success" | "error";
  message: string | null;
  /** Erreurs par champ, consommées par `aria-describedby` côté formulaire. */
  errors: Partial<Record<"full_name" | "phone" | "email" | "message" | "guests", string>>;
}

export const INITIAL_REQUEST_STATE: RequestFormState = {
  status: "idle",
  message: null,
  errors: {},
};
