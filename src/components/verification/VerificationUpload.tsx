"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Camera, Loader2, Send } from "lucide-react";

import { submitVerification } from "@/app/actions/verification";
import { createClient } from "@/lib/supabase/client";
import { checkVideo, verificationVideoPath, VERIFICATION_BUCKET } from "@/lib/verification";
import { VERIFICATION_DOCUMENTS, type VerificationDocument } from "@/types/verification";

type Phase = "idle" | "uploading" | "submitting";

/**
 * Durée lue depuis les métadonnées, sans monter la vidéo dans la page. Renvoie
 * null si le navigateur ne sait pas la décoder (certains Android, Chromium
 * sans codecs propriétaires) : la vidéo reste alors acceptée.
 */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;

    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(value);
    };

    video.preload = "metadata";
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    window.setTimeout(() => done(null), 5000);
    video.src = url;
  });
}

/**
 * Capture et envoi. Le fichier part directement vers Storage (le corps d'une
 * Server Action est plafonné à 1 Mo) ; il reste en mémoire après un échec
 * réseau pour que « Réessayer » ne demande pas de refilmer.
 */
export function VerificationUpload({
  userId,
  requestId,
  uploadedPath,
}: {
  userId: string;
  requestId: string;
  uploadedPath: string | null;
}) {
  const router = useRouter();
  const [documentType, setDocumentType] = useState<VerificationDocument>("cni");
  const [file, setFile] = useState<File | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(uploadedPath);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleFile(selected: File | null) {
    setError(null);
    setFile(null);
    if (!selected) return;

    const check = checkVideo(selected, await readDuration(selected));
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setFile(selected);
  }

  async function send() {
    setError(null);
    let target = videoPath;

    if (!target) {
      if (!file) {
        setError("Filmez d'abord votre vidéo.");
        return;
      }
      const check = checkVideo(file, null);
      if (!check.ok) {
        setError(check.message);
        return;
      }

      target = verificationVideoPath(userId, requestId, check.extension);
      setPhase("uploading");

      const { error: uploadError } = await createClient()
        .storage.from(VERIFICATION_BUCKET)
        .upload(target, file, { contentType: file.type, upsert: false });

      // Un rejeu après coupure peut trouver le fichier déjà déposé : c'est un succès.
      if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) {
        console.error("[verification] upload failed", uploadError);
        setPhase("idle");
        setError("L'envoi a échoué. Vérifiez votre connexion puis réessayez : inutile de refilmer.");
        return;
      }
      setVideoPath(target);
    }

    setPhase("submitting");
    const result = await submitVerification({ requestId, documentType, videoPath: target });

    if (result.status === "error") {
      setPhase("idle");
      setError(result.message);
      return;
    }
    router.refresh();
  }

  const busy = phase !== "idle";

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="document_type" className="text-sm font-medium text-slate-200">
          Pièce d&apos;identité présentée
        </label>
        <select
          id="document_type"
          value={documentType}
          onChange={(event) => setDocumentType(event.target.value as VerificationDocument)}
          disabled={busy}
          className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white"
        >
          {VERIFICATION_DOCUMENTS.map((doc) => (
            <option key={doc.slug} value={doc.slug} className="bg-slate-900">
              {doc.label}
            </option>
          ))}
        </select>
      </div>

      {videoPath ? (
        <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Votre vidéo a bien été reçue. Il reste à finaliser l&apos;envoi.
        </p>
      ) : (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-white/20 bg-white/[0.03] px-4 py-8 text-center transition hover:bg-white/[0.06]">
          <Camera className="size-6 text-slate-300" aria-hidden />
          <span className="text-sm font-medium text-white">
            {file ? file.name : "Filmer ma vidéo"}
          </span>
          <span className="text-xs text-slate-500">15 secondes, caméra frontale</span>
          <input
            type="file"
            accept="video/*"
            capture="user"
            disabled={busy}
            onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
            className="sr-only"
          />
        </label>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={send}
        disabled={busy || (!file && !videoPath)}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-action text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
        {phase === "uploading"
          ? "Envoi en cours…"
          : phase === "submitting"
            ? "Validation…"
            : videoPath
              ? "Finaliser l'envoi"
              : error && file
                ? "Réessayer l'envoi"
                : "Envoyer la vidéo"}
      </button>
    </div>
  );
}
