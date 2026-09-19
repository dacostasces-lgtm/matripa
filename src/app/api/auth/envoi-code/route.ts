import { deliverOtp, otpConfigFromEnv, parseHookPayload, verifyWebhookSignature } from "@/lib/otp-delivery";

export const dynamic = "force-dynamic";

const hookError = (status: number, message: string) =>
  Response.json({ error: { http_code: status, message } }, { status });

/**
 * « Send SMS Hook » de Supabase : reçoit le code de connexion d'un numéro de
 * téléphone et l'achemine par WhatsApp (Infobip) ou, à défaut, par SMS
 * (eSMS Africa). Voir `src/lib/otp-delivery.ts`.
 */
export async function POST(request: Request) {
  const secret = process.env.SEND_SMS_HOOK_SECRET;
  if (!secret) {
    console.error("[envoi-code] SEND_SMS_HOOK_SECRET non configuré");
    return hookError(500, "Envoi de code non configuré.");
  }

  const body = await request.text();
  const signed = verifyWebhookSignature({
    secret,
    id: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    signature: request.headers.get("webhook-signature"),
    body,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!signed) return hookError(401, "Signature invalide.");

  const payload = parseHookPayload(body);
  if (!payload) return hookError(400, "Requête invalide.");

  const result = await deliverOtp(payload.phone, payload.otp, otpConfigFromEnv(process.env));
  if (!result.ok) {
    console.error("[envoi-code] échec d'envoi", result.reason);
    return hookError(502, "Le code n'a pas pu être envoyé.");
  }

  return Response.json({});
}
