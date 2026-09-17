import "server-only";

export interface RequestNotification {
  listingTitle: string;
  listingUrl: string;
  fullName: string;
  phone: string;
  email: string | null;
  message: string;
  desiredDate: string | null;
  guests: number | null;
  city: string;
}

/**
 * Envoi via l'API HTTP de Resend, sans dépendance supplémentaire. Si la clé
 * n'est pas configurée, on journalise et on retourne `false` sans lever : une
 * notification manquée ne doit jamais faire échouer l'enregistrement qui l'a
 * déclenchée, déjà en base à ce stade.
 */
async function sendEmail(message: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_EMAIL_FROM;

  if (!apiKey || !from) {
    console.warn("[notifications] RESEND_API_KEY/NOTIFY_EMAIL_FROM absents — envoi ignoré");
    return false;
  }

  try {
    // Timeout de 10 secondes : les alertes ne doivent jamais bloquer une réponse
    // utilisateur, et Resend doit traiter rapidement. Le catch gère déjà l'abort.
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        reply_to: message.replyTo,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error("[notifications] resend error", response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("[notifications] send failed", error);
    return false;
  }
}

/** Alerte « nouvelle demande » au partenaire. */
export async function sendRequestNotification(
  to: string,
  notification: RequestNotification,
): Promise<boolean> {
  return sendEmail({
    to,
    subject: `Nouvelle demande — ${notification.listingTitle}`,
    html: renderEmail(notification),
    replyTo: notification.email ?? undefined,
  });
}

export type ReportAlert = {
  listingTitle: string;
  city: string;
  reasonLabel: string;
  reportedAt: string;
  adminUrl: string;
};

/**
 * Alerte à l'équipe pour un signalement urgent. Volontairement minimale : ni
 * l'identité du signaleur ni ses précisions ne quittent l'administration.
 */
export async function sendReportAlert(to: string[], alert: ReportAlert): Promise<boolean> {
  return sendEmail({
    to,
    subject: `Signalement urgent — ${alert.reasonLabel}`,
    html: renderReportAlert(alert),
  });
}

/** Échappement HTML : le contenu provient d'une saisie utilisateur. */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function renderEmail(n: RequestNotification): string {
  const row = (label: string, value: string) =>
    `<tr>
       <td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px;">${escapeHtml(label)}</td>
       <td style="padding:6px 0;color:#18181b;font-size:14px;font-weight:500;">${escapeHtml(value)}</td>
     </tr>`;

  return `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a1a1aa;margin:0 0 4px;">Matripa</p>
  <h1 style="font-size:20px;color:#18181b;margin:0 0 20px;">Nouvelle demande reçue</h1>

  <div style="border:1px solid #e4e4e7;border-radius:12px;padding:16px;margin-bottom:20px;">
    <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#18181b;">${escapeHtml(n.listingTitle)}</p>
    <table style="border-collapse:collapse;width:100%;">
      ${row("Ville", n.city)}
      ${row("Nom", n.fullName)}
      ${row("Téléphone", n.phone)}
      ${n.email ? row("E-mail", n.email) : ""}
      ${n.desiredDate ? row("Date souhaitée", n.desiredDate) : ""}
      ${n.guests !== null ? row("Personnes", String(n.guests)) : ""}
    </table>
    ${
      n.message
        ? `<p style="margin:16px 0 0;padding-top:14px;border-top:1px solid #e4e4e7;font-size:14px;color:#3f3f46;white-space:pre-line;">${escapeHtml(n.message)}</p>`
        : ""
    }
  </div>

  <a href="${escapeHtml(n.listingUrl)}"
     style="display:inline-block;background:linear-gradient(90deg,#f43f5e,#7c3aed);color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-size:14px;font-weight:600;">
    Voir le profil
  </a>

  <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;">
    Recontactez le client sous 24 h pour maintenir votre statut de partenaire vérifié.
  </p>
</div>`.trim();
}

function renderReportAlert(alert: ReportAlert): string {
  const reportedAt = new Date(alert.reportedAt).toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Brazzaville",
  });

  return `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a1a1aa;margin:0 0 4px;">Matripa · modération</p>
  <h1 style="font-size:20px;color:#b91c1c;margin:0 0 16px;">Signalement urgent</h1>
  <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;">
    Le profil a été masqué par précaution. Il attend une décision de l'équipe.
  </p>
  <table style="border-collapse:collapse;width:100%;margin-bottom:20px;">
    <tr><td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px;">Motif</td><td style="padding:6px 0;color:#18181b;font-size:14px;font-weight:600;">${escapeHtml(alert.reasonLabel)}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px;">Profil</td><td style="padding:6px 0;color:#18181b;font-size:14px;">${escapeHtml(alert.listingTitle)}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px;">Ville</td><td style="padding:6px 0;color:#18181b;font-size:14px;">${escapeHtml(alert.city)}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#71717a;font-size:13px;">Reçu le</td><td style="padding:6px 0;color:#18181b;font-size:14px;">${escapeHtml(reportedAt)}</td></tr>
  </table>
  <a href="${escapeHtml(alert.adminUrl)}"
     style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-size:14px;font-weight:600;">
    Ouvrir l'administration
  </a>
</div>`.trim();
}
