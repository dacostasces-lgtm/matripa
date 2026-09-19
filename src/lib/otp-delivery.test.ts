import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { deliverOtp, otpConfigFromEnv, parseHookPayload, verifyWebhookSignature } from "./otp-delivery";

const RAW_KEY = Buffer.from("cle-de-test-du-webhook-supabase!");
const SECRET = `v1,whsec_${RAW_KEY.toString("base64")}`;

function sign(id: string, timestamp: string, body: string) {
  return createHmac("sha256", RAW_KEY).update(`${id}.${timestamp}.${body}`).digest("base64");
}

describe("verifyWebhookSignature", () => {
  const body = '{"user":{"phone":"242061234567"},"sms":{"otp":"123456"}}';
  const base = { secret: SECRET, id: "msg_1", timestamp: "1000", body, nowSeconds: 1000 };

  it("accepte une signature valide", () => {
    expect(verifyWebhookSignature({ ...base, signature: `v1,${sign("msg_1", "1000", body)}` })).toBe(true);
  });

  it("accepte si l'une des signatures correspond (rotation)", () => {
    const signature = `v1,AAAA v1,${sign("msg_1", "1000", body)}`;
    expect(verifyWebhookSignature({ ...base, signature })).toBe(true);
  });

  it("refuse un corps modifié", () => {
    const signature = `v1,${sign("msg_1", "1000", body)}`;
    expect(verifyWebhookSignature({ ...base, body: body.replace("123456", "000000"), signature })).toBe(false);
  });

  it("refuse une requête trop ancienne", () => {
    const signature = `v1,${sign("msg_1", "1000", body)}`;
    expect(verifyWebhookSignature({ ...base, signature, nowSeconds: 1000 + 301 })).toBe(false);
  });

  it("refuse sans en-têtes", () => {
    expect(verifyWebhookSignature({ ...base, signature: null })).toBe(false);
  });
});

describe("parseHookPayload", () => {
  it("remet le « + » devant le numéro stocké par Supabase", () => {
    expect(parseHookPayload('{"user":{"phone":"242061234567"},"sms":{"otp":"123456"}}')).toEqual({
      phone: "+242061234567",
      otp: "123456",
    });
  });

  it("rejette un corps illisible ou incomplet", () => {
    expect(parseHookPayload("pas du json")).toBeNull();
    expect(parseHookPayload('{"user":{"phone":"242061234567"},"sms":{}}')).toBeNull();
  });
});

describe("otpConfigFromEnv", () => {
  it("n'active Infobip que si toutes ses variables sont présentes", () => {
    expect(otpConfigFromEnv({ INFOBIP_API_KEY: "k" }).infobip).toBeUndefined();
    const config = otpConfigFromEnv({
      INFOBIP_BASE_URL: "xyz.api.infobip.com/",
      INFOBIP_API_KEY: "k",
      INFOBIP_WHATSAPP_SENDER: "+242 06 000 00 00",
      INFOBIP_TEMPLATE_NAME: "code_connexion",
    });
    expect(config.infobip).toMatchObject({ baseUrl: "https://xyz.api.infobip.com", sender: "242060000000", language: "fr" });
  });
});

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const config = otpConfigFromEnv({
  INFOBIP_BASE_URL: "https://xyz.api.infobip.com",
  INFOBIP_API_KEY: "ib",
  INFOBIP_WHATSAPP_SENDER: "242060000000",
  INFOBIP_TEMPLATE_NAME: "code_connexion",
  ESMS_API_KEY: "es",
  ESMS_SENDER_ID: "MATRIPA",
});

describe("deliverOtp", () => {
  it("envoie par WhatsApp quand Infobip accepte", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json(200, { messages: [{ status: { groupName: "PENDING" } }] }));
    await expect(deliverOtp("+242061234567", "123456", config, fetchFn)).resolves.toEqual({ ok: true, channel: "whatsapp" });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://xyz.api.infobip.com/whatsapp/1/message/template");
    expect(init.headers.Authorization).toBe("App ib");
    const sent = JSON.parse(init.body).messages[0];
    expect(sent.to).toBe("242061234567");
    expect(sent.content.templateData.body.placeholders).toEqual(["123456"]);
  });

  it("bascule sur le SMS si WhatsApp refuse", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json(200, { messages: [{ status: { groupName: "REJECTED" } }] }))
      .mockResolvedValueOnce(json(200, { id: "msg_abc", status: "sent" }));
    await expect(deliverOtp("+242061234567", "123456", config, fetchFn)).resolves.toEqual({ ok: true, channel: "sms" });

    const [url, init] = fetchFn.mock.calls[1];
    expect(url).toBe("https://sms.esmsafrica.io/api/messages/send");
    expect(init.headers.Authorization).toBe("Bearer es");
    expect(JSON.parse(init.body)).toMatchObject({ to: "+242061234567", sender_id: "MATRIPA" });
    expect(JSON.parse(init.body).text).toContain("123456");
  });

  it("signale l'échec si aucun canal ne passe, sans exposer le code", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json(500, {}));
    const result = await deliverOtp("+242061234567", "123456", config, fetchFn);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("123456");
  });

  it("échoue proprement sans aucun canal configuré", async () => {
    await expect(deliverOtp("+242061234567", "123456", {}, vi.fn())).resolves.toEqual({
      ok: false,
      reason: "no_channel_configured",
    });
  });
});
