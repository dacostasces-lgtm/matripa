"use client";

import { MessageCircle, Phone } from "lucide-react";

import { toWhatsAppNumber } from "@/lib/whatsapp";
import { cityLabel, type CitySlug } from "@/types/listing";

interface WhatsAppDirectButtonProps {
  phone?: string | null;
  listingTitle: string;
  city: CitySlug | string;
  className?: string;
  variant?: "primary" | "compact" | "icon";
}

/**
 * Bouton WhatsApp Direct & Appel rapide.
 *
 * Ouvre WhatsApp avec un message d'accroche personnalisé et pré-rempli,
 * respectant les habitudes de mise en relation au Congo (Brazzaville / Pointe-Noire).
 */
export function WhatsAppDirectButton({
  phone,
  listingTitle,
  city,
  className = "",
  variant = "primary",
}: WhatsAppDirectButtonProps) {
  // Sans numéro renseigné sur le profil, aucun bouton : un numéro « par
  // défaut » enverrait le message ou l'appel du client à un inconnu.
  const number = toWhatsAppNumber(phone);
  if (!number) return null;

  const cityName = cityLabel(city);
  const defaultMessage = `Bonjour, je vous contacte depuis Matripa au sujet de votre annonce "${listingTitle}" à ${cityName}. Êtes-vous disponible prochainement ?`;
  const whatsappUrl = `https://wa.me/${number}?text=${encodeURIComponent(defaultMessage)}`;

  if (variant === "icon") {
    return (
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Contacter ${listingTitle} sur WhatsApp`}
        className={`grid size-11 shrink-0 place-items-center rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-400 backdrop-blur-md transition hover:bg-emerald-500/25 hover:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400 active:scale-95 ${className}`}
      >
        <MessageCircle className="size-5" />
      </a>
    );
  }

  if (variant === "compact") {
    return (
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex h-9 items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-300 backdrop-blur-md transition hover:bg-emerald-500/25 hover:text-emerald-200 active:scale-98 ${className}`}
      >
        <MessageCircle className="size-4" />
        WhatsApp Direct
      </a>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-12 flex-1 items-center justify-center gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-600/20 px-4 text-sm font-semibold text-emerald-300 shadow-[0_4px_20px_-6px_rgb(16_185_129/0.3)] backdrop-blur-xl transition hover:border-emerald-500/60 hover:bg-emerald-600/30 hover:text-white active:scale-[0.99]"
      >
        <MessageCircle className="size-5 text-emerald-400" />
        Contacter sur WhatsApp
      </a>

      <a
        href={`tel:+${number}`}
        aria-label="Appeler directement par téléphone"
        title="Appel direct"
        className="grid size-12 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white active:scale-95"
      >
        <Phone className="size-5" />
      </a>
    </div>
  );
}
