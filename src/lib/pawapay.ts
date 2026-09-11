import "server-only";

/**
 * Client HTTP pawaPay — dépôts mobile money.
 *
 * Référence : https://docs.pawapay.io/v2/docs/deposits
 */

import {
  toLocalStatus,
  type LocalStatus,
  type PawaPayProvider,
  type PawaPayStatus,
} from "@/lib/pawapay-shared";

export * from "@/lib/pawapay-shared";

interface InitiateResult {
  ok: boolean;
  status: LocalStatus;
  failureCode?: string;
  message?: string;
}

const baseUrl = () =>
  (process.env.PAWAPAY_BASE_URL ?? "https://api.sandbox.pawapay.io").replace(/\/+$/, "");

/**
 * Initie un dépôt. `depositId` est l'identifiant de notre ligne `payments` :
 * il sert de clé d'idempotence côté pawaPay, un rejeu renvoie donc
 * `DUPLICATE_IGNORED` plutôt que de débiter une seconde fois.
 */
export async function initiateDeposit(params: {
  depositId: string;
  amountXaf: number;
  msisdn: string;
  provider: PawaPayProvider;
}): Promise<InitiateResult> {
  const token = process.env.PAWAPAY_API_TOKEN;

  if (!token) {
    console.warn("[pawapay] PAWAPAY_API_TOKEN absent — initiation ignorée");
    return { ok: false, status: "failed", failureCode: "not_configured" };
  }

  try {
    const response = await fetch(`${baseUrl()}/v2/deposits`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        depositId: params.depositId,
        // Le montant est une chaîne dans l'API, et sans décimales en XAF.
        amount: String(params.amountXaf),
        currency: "XAF",
        payer: {
          type: "MMO",
          accountDetails: {
            phoneNumber: params.msisdn,
            provider: params.provider,
          },
        },
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      status?: PawaPayStatus;
      failureReason?: { failureCode?: string; failureMessage?: string };
    };

    if (!response.ok || !body.status) {
      console.error("[pawapay] initiation failed", response.status, body);
      return {
        ok: false,
        status: "failed",
        failureCode: body.failureReason?.failureCode ?? `http_${response.status}`,
        message: body.failureReason?.failureMessage,
      };
    }

    const local = toLocalStatus(body.status);

    return {
      ok: local !== "failed",
      status: local,
      failureCode: body.failureReason?.failureCode,
      message: body.failureReason?.failureMessage,
    };
  } catch (error) {
    console.error("[pawapay] initiation error", error);
    return { ok: false, status: "failed", failureCode: "network_error" };
  }
}

/**
 * Interroge l'état d'un dépôt.
 *
 * Sert de filet quand le callback n'arrive pas : en mobile money, une
 * transaction aboutie dont la notification s'est perdue laisserait sinon le
 * paiement indéfiniment « en cours ».
 */
export async function checkDepositStatus(depositId: string): Promise<LocalStatus | null> {
  const token = process.env.PAWAPAY_API_TOKEN;
  if (!token) return null;

  try {
    const response = await fetch(`${baseUrl()}/v2/deposits/${depositId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!response.ok) return null;

    const body = (await response.json()) as { status?: PawaPayStatus };
    return body.status ? toLocalStatus(body.status) : null;
  } catch (error) {
    console.error("[pawapay] status check error", error);
    return null;
  }
}
