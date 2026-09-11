import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkDepositStatus, type PawaPayStatus } from "@/lib/pawapay";

export const dynamic = "force-dynamic";

/**
 * Callback pawaPay sur l'issue d'un dépôt.
 *
 * Le corps n'est **pas** cru sur parole. pawaPay signe ses callbacks
 * (RFC-9421, ECDSA P-256), mais la vérification suppose d'activer la
 * fonctionnalité dans leur tableau de bord et de récupérer leur clé publique.
 * Tant que ce n'est pas fait, on ne se fie pas au statut reçu : on le
 * **reconfirme auprès de l'API** avec notre propre jeton avant d'écrire quoi
 * que ce soit. Un POST forgé ne peut donc pas marquer un paiement comme abouti.
 */
export async function POST(request: Request) {
  let payload: {
    depositId?: string;
    status?: PawaPayStatus;
    providerTransactionId?: string;
    failureReason?: { failureCode?: string };
  };

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const depositId = payload.depositId;

  if (typeof depositId !== "string" || !depositId) {
    return Response.json({ error: "missing_deposit_id" }, { status: 400 });
  }

  // Source de vérité : l'API, pas le corps de la requête.
  const confirmed = await checkDepositStatus(depositId);

  if (!confirmed) {
    // Sans confirmation possible, on n'écrit rien plutôt que d'enregistrer un
    // état invérifiable. pawaPay réémettra le callback.
    console.error("[pawapay] statut non confirmable pour", depositId);
    return Response.json({ error: "unverified" }, { status: 502 });
  }

  const admin = createAdminClient();

  const { error } = await admin.rpc("settle_payment", {
    p_payment_id: depositId,
    p_status: confirmed,
    p_failure_code: payload.failureReason?.failureCode ?? null,
    p_provider_txn: payload.providerTransactionId ?? null,
  });

  if (error) {
    console.error("[pawapay] settle failed", depositId, error);
    // 404 : l'identifiant ne correspond à aucun paiement connu. Inutile que
    // pawaPay réessaie indéfiniment.
    const unknown = error.message.includes("payment_not_found");
    return Response.json({ error: "settle_failed" }, { status: unknown ? 404 : 500 });
  }

  revalidatePath("/mes-demandes");

  return Response.json({ ok: true, status: confirmed });
}

/** Sanity check pour la configuration du callback côté pawaPay. */
export function GET() {
  return Response.json({ ok: true, endpoint: "pawapay-deposit-callback" });
}
