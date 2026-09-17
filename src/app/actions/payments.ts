"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { initiateDeposit, isPawaPayProvider, toMsisdn } from "@/lib/pawapay";
import type { PaymentFormState } from "@/lib/payment-form";

/**
 * Lance un paiement mobile money pour une demande.
 *
 * Le montant n'est jamais reçu du formulaire : `create_payment` le lit sur
 * l'annonce, en base. Le client choisit seulement son opérateur et son numéro.
 */
export async function startPayment(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const requestId = String(formData.get("request_id") ?? "");
  const provider = String(formData.get("provider") ?? "");
  const rawPhone = String(formData.get("phone") ?? "");

  if (!requestId) return { status: "error", message: "Demande introuvable." };
  if (!isPawaPayProvider(provider)) {
    return { status: "error", message: "Choisissez un opérateur." };
  }

  const msisdn = toMsisdn(rawPhone);
  if (!msisdn) {
    return {
      status: "error",
      message: "Numéro invalide. Format attendu : 06 123 45 67.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion?suivant=/mes-demandes");

  const { data, error } = await supabase.rpc("create_payment", {
    p_request_id: requestId,
    p_provider: provider,
    p_phone: msisdn,
  });

  if (error) {
    console.error("[payments] creation failed", error);

    if (error.message.includes("payment_already_exists")) {
      return { status: "error", message: "Un paiement est déjà en cours pour cette demande." };
    }
    if (error.message.includes("not_eligible")) {
      return { status: "error", message: "Cette demande ne peut pas être réglée." };
    }
    if (error.message.includes("listing_unavailable")) {
      return {
        status: "error",
        message: "Ce profil n'est plus disponible : le paiement ne peut pas être effectué.",
      };
    }
    return { status: "error", message: "L'initiation a échoué. Réessayez." };
  }

  const payment = data?.[0];
  if (!payment) return { status: "error", message: "L'initiation a échoué. Réessayez." };

  const result = await initiateDeposit({
    depositId: payment.payment_id,
    amountXaf: payment.amount_xaf,
    msisdn,
    provider,
  });

  // La ligne existe déjà : on reflète le verdict de pawaPay. Écrire le statut
  // exige `service_role`, aucun rôle client ne peut s'auto-déclarer payé.
  const admin = createAdminClient();
  await admin.rpc("settle_payment", {
    p_payment_id: payment.payment_id,
    p_status: result.status,
    p_failure_code: result.failureCode ?? null,
    p_provider_txn: null,
  });

  revalidatePath("/mes-demandes");

  if (!result.ok) {
    return {
      status: "error",
      message:
        result.failureCode === "not_configured"
          ? "Le paiement mobile n'est pas encore activé sur ce site."
          : (result.message ?? "Le paiement a été refusé par l'opérateur."),
    };
  }

  return {
    status: "processing",
    message:
      "Validez la demande de paiement sur votre téléphone. Le statut se met à jour automatiquement.",
  };
}
