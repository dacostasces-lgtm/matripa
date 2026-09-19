"use client";

import { useState } from "react";
import { AlertCircle, ArrowLeft, Loader2, MessageCircle } from "lucide-react";

import type { AuthProvider } from "@/lib/auth-providers";
import { normalizePhone } from "@/lib/auth-providers";
import { cx } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

/** N'autorise que des chemins internes : bloque les redirections ouvertes. */
const safeNext = (value: string) =>
  value.startsWith("/") && !value.startsWith("//") ? value : "/partenaire";

const BUTTON =
  "inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border text-sm font-medium transition " +
  "disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/40";

/**
 * Connexion par Google, Facebook ou WhatsApp, affichée au-dessus du
 * formulaire e-mail. Seuls les fournisseurs activés sont rendus
 * (`enabledAuthProviders`).
 *
 * Google et Facebook passent par une redirection OAuth qui revient sur
 * `/auth/callback`, lequel échange le code contre une session comme pour les
 * liens reçus par e-mail. WhatsApp envoie un code à usage unique au numéro
 * saisi (connexion par téléphone de Supabase) ; le code est acheminé par
 * WhatsApp, ou par SMS à défaut (`/api/auth/envoi-code`).
 */
export function SocialLogin({ providers, next }: { providers: AuthProvider[]; next: string }) {
  const [pending, setPending] = useState<AuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [whatsappOpen, setWhatsappOpen] = useState(false);

  if (providers.length === 0) return null;

  async function signInWithOAuth(provider: "google" | "facebook") {
    setError(null);
    setPending(provider);
    const redirectTo = `${window.location.origin}/auth/callback?suivant=${encodeURIComponent(safeNext(next))}`;
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    // En cas de succès, le navigateur part chez le fournisseur : on ne revient
    // ici qu'en cas d'échec.
    if (oauthError) {
      console.error("[auth] oauth start failed", oauthError);
      setPending(null);
      setError("La connexion n'a pas pu démarrer. Réessayez ou utilisez votre e-mail.");
    }
  }

  if (whatsappOpen) {
    return <WhatsAppLogin next={next} onBack={() => setWhatsappOpen(false)} />;
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {providers.includes("google") && (
        <button
          type="button"
          onClick={() => signInWithOAuth("google")}
          disabled={pending !== null}
          className={cx(BUTTON, "border-white/15 bg-white text-slate-900 hover:bg-slate-100")}
        >
          {pending === "google" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <GoogleMark />}
          Continuer avec Google
        </button>
      )}

      {providers.includes("facebook") && (
        <button
          type="button"
          onClick={() => signInWithOAuth("facebook")}
          disabled={pending !== null}
          className={cx(BUTTON, "border-transparent bg-[#1877F2] text-white hover:brightness-110")}
        >
          {pending === "facebook" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FacebookMark />}
          Continuer avec Facebook
        </button>
      )}

      {providers.includes("whatsapp") && (
        <button
          type="button"
          onClick={() => setWhatsappOpen(true)}
          disabled={pending !== null}
          className={cx(BUTTON, "border-transparent bg-[#25D366] text-slate-950 hover:brightness-105")}
        >
          <MessageCircle className="size-4" aria-hidden />
          Continuer avec WhatsApp
        </button>
      )}

      <div className="flex items-center gap-3 pt-1 text-xs text-slate-500" aria-hidden>
        <span className="h-px flex-1 bg-white/10" />
        ou avec votre e-mail
        <span className="h-px flex-1 bg-white/10" />
      </div>
    </div>
  );
}

/** Numéro, puis code reçu sur WhatsApp. */
function WhatsAppLogin({ next, onBack }: { next: string; onBack: () => void }) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setError(null);
    const normalized = normalizePhone(phoneInput);
    if (!normalized) {
      setError("Numéro invalide. Exemple : 06 123 45 67.");
      return;
    }
    setPending(true);
    // Le canal (WhatsApp puis SMS) est choisi par notre relais côté serveur.
    const { error: otpError } = await createClient().auth.signInWithOtp({ phone: normalized });
    setPending(false);
    if (otpError) {
      console.error("[auth] whatsapp otp failed", otpError);
      setError(
        /rate|limit/i.test(otpError.message)
          ? "Trop de demandes de code. Patientez une minute avant de réessayer."
          : "Le code n'a pas pu être envoyé. Vérifiez le numéro ou utilisez votre e-mail.",
      );
      return;
    }
    setPhone(normalized);
    setStep("code");
  }

  async function verifyCode() {
    if (!phone) return;
    setError(null);
    setPending(true);
    const { error: verifyError } = await createClient().auth.verifyOtp({
      phone,
      token: code.trim(),
      type: "sms",
    });
    if (verifyError) {
      console.error("[auth] whatsapp verify failed", verifyError);
      setPending(false);
      setError("Code incorrect ou expiré. Vérifiez-le ou demandez-en un nouveau.");
      return;
    }
    // Rechargement complet : le serveur doit lire les cookies de la nouvelle
    // session dès la page suivante.
    window.location.assign(safeNext(next));
  }

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-white"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Autres moyens de connexion
      </button>

      {error && (
        <p role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {step === "phone" ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void sendCode();
          }}
        >
          <label htmlFor="whatsapp-phone" className="text-sm font-medium text-slate-200">
            Numéro WhatsApp
          </label>
          <input
            id="whatsapp-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="06 123 45 67"
            value={phoneInput}
            onChange={(event) => setPhoneInput(event.target.value)}
            className={INPUT}
          />
          <button type="submit" disabled={pending} className={cx(BUTTON, "border-transparent bg-[#25D366] text-slate-950")}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Recevoir un code sur WhatsApp
          </button>
          <p className="text-center text-xs text-slate-500">
            Sans WhatsApp sur ce numéro, le code arrive par SMS.
          </p>
        </form>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void verifyCode();
          }}
        >
          <label htmlFor="whatsapp-code" className="text-sm font-medium text-slate-200">
            Code reçu au {phone}
          </label>
          <input
            id="whatsapp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            className={cx(INPUT, "text-center font-mono text-lg tracking-[0.4em]")}
          />
          <button
            type="submit"
            disabled={pending || code.length !== 6}
            className={cx(BUTTON, "border-transparent bg-[#25D366] text-slate-950")}
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Valider le code
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("phone");
              setCode("");
            }}
            className="w-full text-center text-xs text-slate-400 hover:text-white"
          >
            Changer de numéro ou renvoyer un code
          </button>
        </form>
      )}
    </div>
  );
}

const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white " +
  "placeholder:text-slate-600 transition focus:border-neon/50 focus:outline-none focus:ring-2 focus:ring-neon/30";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="currentColor" d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3z" />
    </svg>
  );
}
