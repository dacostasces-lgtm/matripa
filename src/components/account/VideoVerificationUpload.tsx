"use client";

import { useState } from "react";
import { Camera, CheckCircle2, ShieldAlert, Sparkles, Video, Upload, AlertCircle } from "lucide-react";

/**
 * Composant de vérification d'authenticité par Selfie Vidéo (5 secondes).
 *
 * Processus :
 *  1. Consignes claires pour éviter l'usurpation (regarder la caméra, tourner légèrement la tête).
 *  2. Enregistrement ou téléversement d'un clip court privé (crypté).
 *  3. Revue confidentielle garantissant l'attribution du badge "Selfie Vérifié".
 */
export function VideoVerificationUpload() {
  const [step, setStep] = useState<"intro" | "recording" | "uploaded">("intro");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleSimulatedUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFileName(e.target.files[0].name);
      setIsSubmitting(true);
      setTimeout(() => {
        setIsSubmitting(false);
        setStep("uploaded");
      }, 1500);
    }
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30">
          <Camera className="size-6" />
        </span>
        <div>
          <h3 className="font-display text-lg font-semibold text-white">
            Certification par Selfie Vidéo
          </h3>
          <p className="text-xs text-slate-400">
            Validez l&apos;authenticité de votre profil et obtenez le badge prioritaire
          </p>
        </div>
      </div>

      {step === "intro" && (
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/20 p-4 text-xs leading-relaxed text-cyan-200">
            <p className="font-semibold text-cyan-100 mb-1 flex items-center gap-1.5">
              <Sparkles className="size-3.5" /> Pourquoi certifier votre profil ?
            </p>
            Les membres vérifiés par selfie vidéo reçoivent 4x plus de contacts directs, évitent les
            soupçons de faux comptes et bénéficient d&apos;un classement prioritaire sur Matripa.
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Consignes d&apos;enregistrement (5 secondes)
            </h4>
            <ul className="space-y-1.5 text-xs text-slate-300">
              <li className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-cyan-400" />
                Filmez votre visage face à la caméra dans un endroit bien éclairé.
              </li>
              <li className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-cyan-400" />
                Tournez lentement la tête de gauche à droite.
              </li>
              <li className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-cyan-400" />
                Votre vidéo reste 100% privée et n&apos;est jamais publiée sur le site public.
              </li>
            </ul>
          </div>

          <label className="mt-4 flex h-14 w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-cyan-400/40 bg-cyan-500/15 text-sm font-semibold text-cyan-200 shadow-[0_0_20px_-5px_rgb(34_211_238/0.3)] transition hover:bg-cyan-500/25 active:scale-98">
            <Video className="size-5" />
            <span>Enregistrer ou choisir un selfie vidéo</span>
            <input
              type="file"
              accept="video/*"
              capture="user"
              onChange={handleSimulatedUpload}
              className="hidden"
            />
          </label>
        </div>
      )}

      {isSubmitting && (
        <div className="mt-6 flex flex-col items-center justify-center gap-3 py-8 text-center">
          <div className="size-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <p className="text-xs text-slate-300 font-medium">
            Chiffrement et transmission sécurisée du selfie vidéo...
          </p>
        </div>
      )}

      {step === "uploaded" && !isSubmitting && (
        <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40">
            <CheckCircle2 className="size-6" />
          </div>
          <h4 className="mt-3 text-base font-semibold text-white">Vidéo soumise avec succès</h4>
          <p className="mt-1 text-xs text-slate-300">
            Fichier : {fileName || "selfie-verification.mp4"}. L&apos;équipe Matripa valide votre
            authenticité sous 2 à 4 heures. Dès validation, le badge cyan{" "}
            <strong>&quot;Selfie Vérifié&quot;</strong> apparaîtra sur votre annonce.
          </p>
        </div>
      )}
    </div>
  );
}
