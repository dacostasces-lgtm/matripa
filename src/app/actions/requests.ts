"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
// Un module "use server" ne peut exporter que des fonctions async : l'état
// initial et son type vivent donc dans un module ordinaire.
import type { RequestFormState } from "@/lib/request-form";

/** Formats acceptés au Congo : +242 06 xxx xx xx, 06 xxx xx xx, etc. */
const PHONE_RE = /^\+?[0-9][0-9\s]{7,19}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const text = (formData: FormData, key: string): string =>
  typeof formData.get(key) === "string" ? (formData.get(key) as string).trim() : "";

/**
 * Soumission d'une demande de mise en relation.
 *
 * La validation est refaite ici : les contraintes HTML (`required`, `pattern`)
 * ne sont qu'une aide à la saisie et peuvent être contournées. L'insertion
 * passe par la fonction `submit_request` (SECURITY DEFINER), qui applique en
 * plus le contrôle de disponibilité et l'anti-spam.
 */
export async function submitRequest(
  _prevState: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const listingId = text(formData, "listing_id");
  const listingSlug = text(formData, "listing_slug");
  const fullName = text(formData, "full_name");
  const phone = text(formData, "phone");
  const email = text(formData, "email");
  const message = text(formData, "message");
  const desiredDate = text(formData, "desired_date");
  const guestsRaw = text(formData, "guests");

  const errors: RequestFormState["errors"] = {};

  if (fullName.length < 2 || fullName.length > 80) {
    errors.full_name = "Indiquez votre nom complet (2 à 80 caractères).";
  }
  if (!PHONE_RE.test(phone)) {
    errors.phone = "Numéro invalide. Exemple : +242 06 123 45 67";
  }
  if (email && !EMAIL_RE.test(email)) {
    errors.email = "Adresse e-mail invalide.";
  }
  if (message.length > 1000) {
    errors.message = "Message trop long (1000 caractères maximum).";
  }

  const guests = guestsRaw ? Number.parseInt(guestsRaw, 10) : null;
  if (guests !== null && (!Number.isInteger(guests) || guests < 1 || guests > 200)) {
    errors.guests = "Nombre de personnes invalide (1 à 200).";
  }

  if (!listingId || Object.keys(errors).length > 0) {
    return {
      status: "error",
      message: "Veuillez corriger les champs signalés.",
      errors,
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("submit_request", {
    p_listing_id: listingId,
    p_full_name: fullName,
    p_phone: phone.replace(/\s+/g, " "),
    p_email: email || null,
    p_message: message,
    p_desired_date: desiredDate || null,
    p_guests: guests,
  });

  if (error) {
    console.error("[requests] submit failed", error);

    if (error.message.includes("rate_limited")) {
      return {
        status: "error",
        message: "Trop de demandes envoyées récemment. Réessayez dans une heure.",
        errors: {},
      };
    }
    if (error.message.includes("listing_unavailable")) {
      return {
        status: "error",
        message: "Ce profil n'est plus disponible.",
        errors: {},
      };
    }
    return {
      status: "error",
      message: "L'envoi a échoué. Merci de réessayer dans un instant.",
      errors: {},
    };
  }

  if (listingSlug) revalidatePath(`/annonces/${listingSlug}`);

  return {
    status: "success",
    message: "Demande envoyée. Un conseiller Matripa vous recontacte sous 24 h.",
    errors: {},
  };
}

/**
 * Fait avancer le statut d'une demande.
 *
 * Aucun filtre supplémentaire n'est nécessaire ici : `requests` n'a pas de
 * policy de lecture ou d'écriture publique, et `requests_listing_owner_update`
 * borne déjà la mise à jour au propriétaire de l'annonce concernée. Le GRANT
 * de colonne (`update (status)`) empêche par ailleurs de toucher aux
 * coordonnées du client.
 */
export async function setRequestStatus(formData: FormData) {
  const requestId = text(formData, "request_id");
  const status = text(formData, "status");

  if (!["pending", "contacted", "confirmed", "cancelled"].includes(status)) return;

  const supabase = await createClient();

  const { error } = await supabase
    .from("requests")
    .update({ status: status as "pending" | "contacted" | "confirmed" | "cancelled" })
    .eq("id", requestId);

  if (error) console.error("[requests] status update failed", error);

  revalidatePath("/partenaire");
}
