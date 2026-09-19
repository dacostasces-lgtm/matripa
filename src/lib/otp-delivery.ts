import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Envoi des codes de connexion par téléphone.
 *
 * Supabase génère et vérifie le code lui-même ; il nous le confie seulement
 * pour l'acheminer (« Send SMS Hook »). On tente WhatsApp via Infobip, puis le
 * SMS via eSMS Africa si WhatsApp n'est pas configuré ou échoue (numéro sans
 * WhatsApp, modèle refusé…).
 *
 * Le produit « Verify » d'eSMS Africa n'est pas utilisable ici : il génère son
 * propre code, que Supabase ne saurait pas vérifier.
 */

export type OtpConfig = {
  infobip?: { baseUrl: string; apiKey: string; sender: string; templateName: string; language: string };
  esms?: { apiKey: string; senderId?: string };
};

export function otpConfigFromEnv(env: Record<string, string | undefined>): OtpConfig {
  const config: OtpConfig = {};
  const { INFOBIP_BASE_URL, INFOBIP_API_KEY, INFOBIP_WHATSAPP_SENDER, INFOBIP_TEMPLATE_NAME } = env;
  if (INFOBIP_BASE_URL && INFOBIP_API_KEY && INFOBIP_WHATSAPP_SENDER && INFOBIP_TEMPLATE_NAME) {
    config.infobip = {
      baseUrl: INFOBIP_BASE_URL.replace(/\/+$/, "").replace(/^(?!https?:\/\/)/, "https://"),
      apiKey: INFOBIP_API_KEY,
      sender: INFOBIP_WHATSAPP_SENDER.replace(/\D/g, ""),
      templateName: INFOBIP_TEMPLATE_NAME,
      language: env.INFOBIP_TEMPLATE_LANGUAGE || "fr",
    };
  }
  if (env.ESMS_API_KEY) {
    config.esms = { apiKey: env.ESMS_API_KEY, senderId: env.ESMS_SENDER_ID || undefined };
  }
  return config;
}

/** Tolérance d'horloge des webhooks : au-delà, on rejette (rejeu). */
const MAX_SKEW_SECONDS = 5 * 60;

/**
 * Vérifie la signature « Standard Webhooks » posée par Supabase.
 * `secret` est la valeur fournie par Supabase (`v1,whsec_<base64>`).
 */
export function verifyWebhookSignature(input: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowSeconds: number;
}): boolean {
  const { id, timestamp, signature, body } = input;
  if (!id || !timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(input.nowSeconds - ts) > MAX_SKEW_SECONDS) return false;

  const key = Buffer.from(input.secret.replace(/^v1,/, "").replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();

  // L'en-tête peut contenir plusieurs signatures (« v1,xxx v1,yyy ») pendant
  // une rotation de secret.
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const received = Buffer.from(value, "base64");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

/** Extrait le numéro (E.164) et le code du corps envoyé par Supabase. */
export function parseHookPayload(body: string): { phone: string; otp: string } | null {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  const payload = data as { user?: { phone?: unknown }; sms?: { otp?: unknown } };
  const rawPhone = typeof payload.user?.phone === "string" ? payload.user.phone : "";
  const otp = typeof payload.sms?.otp === "string" ? payload.sms.otp : "";
  const digits = rawPhone.replace(/\D/g, "");

  if (digits.length < 8 || digits.length > 15 || !/^\d{4,10}$/.test(otp)) return null;
  return { phone: `+${digits}`, otp };
}

export const smsText = (otp: string) =>
  `Matripa : votre code de connexion est ${otp}. Il expire dans quelques minutes. Ne le communiquez à personne.`;

type Fetch = typeof fetch;

async function sendWhatsApp(config: NonNullable<OtpConfig["infobip"]>, phone: string, otp: string, fetchFn: Fetch) {
  const response = await fetchFn(`${config.baseUrl}/whatsapp/1/message/template`, {
    method: "POST",
    headers: {
      Authorization: `App ${config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          from: config.sender,
          to: phone.slice(1),
          content: {
            templateName: config.templateName,
            // Modèle « Authentification » de Meta : le code apparaît dans le
            // texte et dans le bouton « Copier le code ».
            templateData: {
              body: { placeholders: [otp] },
              buttons: [{ type: "URL", parameter: otp }],
            },
            language: config.language,
          },
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`infobip http ${response.status}`);

  const result = (await response.json()) as { messages?: { status?: { groupName?: string } }[] };
  const group = result.messages?.[0]?.status?.groupName;
  if (group === "REJECTED" || group === "UNDELIVERABLE") throw new Error(`infobip ${group}`);
}

async function sendSms(config: NonNullable<OtpConfig["esms"]>, phone: string, otp: string, fetchFn: Fetch) {
  const response = await fetchFn("https://sms.esmsafrica.io/api/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      to: phone,
      text: smsText(otp),
      ...(config.senderId ? { sender_id: config.senderId } : {}),
    }),
  });
  if (!response.ok) throw new Error(`esms http ${response.status}`);
}

export type DeliveryResult = { ok: true; channel: "whatsapp" | "sms" } | { ok: false; reason: string };

/** WhatsApp d'abord, puis SMS en secours. Ne journalise jamais le code. */
export async function deliverOtp(
  phone: string,
  otp: string,
  config: OtpConfig,
  fetchFn: Fetch = fetch,
): Promise<DeliveryResult> {
  const failures: string[] = [];

  if (config.infobip) {
    try {
      await sendWhatsApp(config.infobip, phone, otp, fetchFn);
      return { ok: true, channel: "whatsapp" };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "infobip error");
    }
  }

  if (config.esms) {
    try {
      await sendSms(config.esms, phone, otp, fetchFn);
      return { ok: true, channel: "sms" };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "esms error");
    }
  }

  return { ok: false, reason: failures.length ? failures.join("; ") : "no_channel_configured" };
}
