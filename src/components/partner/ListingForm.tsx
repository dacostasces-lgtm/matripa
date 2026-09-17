"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { AlertCircle, Clapperboard, ImagePlus, Loader2, Plus, Save, Trash2, X } from "lucide-react";

import { createListing, updateListing } from "@/app/actions/listings";
import { INITIAL_LISTING_STATE, slugify } from "@/lib/listing-form";
import { createClient } from "@/lib/supabase/client";
import { cx } from "@/lib/format";
import {
  CATEGORIES,
  CITIES,
  MOBILITIES,
  OPTION_TYPES,
  PRICE_UNIT_LABEL,
  type Rate,
} from "@/types/listing";

const MAX_IMAGES = 6;
const MAX_RATES = 8;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

/** Sous-ensemble modifiable d'une annonce. */
export interface EditableListing {
  id: string;
  slug: string;
  title: string;
  highlight: string | null;
  description: string;
  category: string;
  option_type: string;
  mobility: string;
  city: string;
  district: string | null;
  price_xaf: number;
  price_unit: string;
  rates: Rate[];
  cover_url: string;
  images: string[];
  video_url: string | null;
  amenities: string[];
  is_available_now: boolean;
  languages: string[];
  availability: string[];
  status: string;
}

interface Uploaded {
  url: string;
  /** Chemin Storage, connu seulement pour les fichiers envoyés dans la session. */
  path: string | null;
}

/** `https://…/object/public/listings/<path>` → `<path>` */
function pathFromUrl(url: string): string | null {
  const marker = "/object/public/listings/";
  const index = url.indexOf(marker);
  return index === -1 ? null : url.slice(index + marker.length);
}

export function ListingForm({
  userId,
  listing,
  canPublish,
}: {
  userId: string;
  listing?: EditableListing;
  /** Compte vérifié, ou annonce déjà publiée encore dans son délai de grâce. */
  canPublish: boolean;
}) {
  const isEdit = Boolean(listing);
  const [state, formAction] = useActionState(
    isEdit ? updateListing : createListing,
    INITIAL_LISTING_STATE,
  );

  const [images, setImages] = useState<Uploaded[]>(() =>
    listing
      ? [listing.cover_url, ...listing.images].map((url) => ({ url, path: pathFromUrl(url) }))
      : [],
  );
  const [rates, setRates] = useState<Rate[]>(() => listing?.rates ?? []);
  const [video, setVideo] = useState<Uploaded | null>(() =>
    listing?.video_url ? { url: listing.video_url, path: pathFromUrl(listing.video_url) } : null,
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  /**
   * Téléversement direct vers Storage depuis le navigateur : le corps d'une
   * Server Action est plafonné à 1 Mo, ce qui exclut d'y faire transiter des
   * photos. La policy `listings_owner_insert` confine l'écriture au dossier de
   * l'utilisateur.
   */
  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setUploadError(null);

      const batch = Array.from(files).slice(0, MAX_IMAGES - images.length);
      if (batch.some((f) => f.size > MAX_BYTES)) {
        setUploadError("Chaque image doit peser moins de 5 Mo.");
        return;
      }

      setUploading(true);
      const supabase = createClient();
      const folder = slugify(titleRef.current?.value || listing?.slug || "offre") || "offre";
      const added: Uploaded[] = [];

      for (const file of batch) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${userId}/${folder}/${crypto.randomUUID()}.${ext}`;

        const { error } = await supabase.storage
          .from("listings")
          .upload(path, file, { contentType: file.type, upsert: false });

        if (error) {
          setUploadError("Le téléversement a échoué. Réessayez.");
          break;
        }
        added.push({ url: supabase.storage.from("listings").getPublicUrl(path).data.publicUrl, path });
      }

      setImages((prev) => [...prev, ...added]);
      setUploading(false);
    },
    [images.length, listing?.slug, userId],
  );

  const removeImage = async (url: string) => {
    const target = images.find((i) => i.url === url);
    setImages((prev) => prev.filter((i) => i.url !== url));

    // Suppression au mieux : un fichier orphelin est sans conséquence, alors
    // qu'une erreur ici bloquerait la saisie.
    if (target?.path) {
      await createClient().storage.from("listings").remove([target.path]);
    }
  };

  /**
   * Aperçu vidéo — même canal que les images (téléversement direct vers
   * Storage), mais un seul fichier : le rail d'accueil n'en montre qu'un, et
   * plafonner à 40 Mo évite qu'une vidéo non compressée rende le formulaire
   * impraticable sur une connexion mobile.
   */
  const handleVideo = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setUploadError(null);

      if (file.size > MAX_VIDEO_BYTES) {
        setUploadError("L'aperçu vidéo doit peser moins de 40 Mo.");
        return;
      }

      setUploading(true);
      const supabase = createClient();
      const folder = slugify(titleRef.current?.value || listing?.slug || "offre") || "offre";
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp4";
      const path = `${userId}/${folder}/apercu-${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage
        .from("listings")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (error) {
        setUploadError("Le téléversement de la vidéo a échoué. Réessayez.");
      } else {
        setVideo({
          url: supabase.storage.from("listings").getPublicUrl(path).data.publicUrl,
          path,
        });
      }
      setUploading(false);
    },
    [listing?.slug, userId],
  );

  const removeVideo = async () => {
    const target = video;
    setVideo(null);
    if (target?.path) {
      await createClient().storage.from("listings").remove([target.path]);
    }
  };

  const [cover, ...gallery] = images;

  return (
    <form action={formAction} className="space-y-7" noValidate>
      {isEdit && (
        <>
          <input type="hidden" name="listing_id" value={listing!.id} />
          <input type="hidden" name="slug" value={listing!.slug} />
        </>
      )}

      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}

      {/* Visuels ------------------------------------------------------- */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-slate-200">
            Visuels <span className="text-red-400">*</span>
          </h2>
          <span className="text-xs text-slate-500">
            {images.length}/{MAX_IMAGES} — la première sert de couverture
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((img, index) => (
            <div
              key={img.url}
              className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-white/10"
            >
              <Image src={img.url} alt="" fill sizes="160px" className="object-cover" />
              {index === 0 && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                  Couverture
                </span>
              )}
              <button
                type="button"
                onClick={() => removeImage(img.url)}
                aria-label="Retirer cette image"
                className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/70 text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100 focus:opacity-100"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}

          {images.length < MAX_IMAGES && (
            <label className="grid aspect-[3/4] cursor-pointer place-items-center rounded-xl border border-dashed border-white/20 bg-white/[0.03] text-slate-400 transition hover:border-white/35 hover:bg-white/[0.06] hover:text-white">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(e) => {
                  void handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              {uploading ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : (
                <span className="flex flex-col items-center gap-1.5 text-xs">
                  <ImagePlus className="size-5" aria-hidden />
                  Ajouter
                </span>
              )}
            </label>
          )}
        </div>

        {(uploadError || state.errors.cover_url) && (
          <p className="text-xs text-red-300">{uploadError ?? state.errors.cover_url}</p>
        )}

        <input type="hidden" name="cover_url" value={cover?.url ?? ""} />
        {gallery.map((img) => (
          <input key={img.url} type="hidden" name="images" value={img.url} />
        ))}
      </section>

      {/* Aperçu vidéo --------------------------------------------------- */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-slate-200">Aperçu vidéo</h2>
          <span className="text-xs text-slate-500">Format vertical conseillé · 40 Mo max</span>
        </div>

        {video ? (
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <video
              src={video.url}
              muted
              playsInline
              preload="metadata"
              className="h-20 w-[60px] shrink-0 rounded-lg bg-black object-cover"
            />
            <p className="min-w-0 flex-1 text-sm text-slate-300">
              Aperçu joint
              <span className="mt-0.5 block text-xs text-slate-500">
                Il apparaîtra dans le carrousel d&apos;accueil et sous l&apos;onglet Vidéo de la
                fiche.
              </span>
            </p>
            <button
              type="button"
              onClick={() => void removeVideo()}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-sm text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
            >
              <Trash2 className="size-4" aria-hidden />
              Retirer
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/20 bg-white/[0.03] px-4 py-4 text-sm text-slate-400 transition hover:border-white/35 hover:bg-white/[0.06] hover:text-white">
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="sr-only"
              onChange={(e) => {
                void handleVideo(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {uploading ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <Clapperboard className="size-5" aria-hidden />
            )}
            Ajouter un aperçu vidéo (facultatif)
          </label>
        )}

        <input type="hidden" name="video_url" value={video?.url ?? ""} />
      </section>

      {/* Descriptif ---------------------------------------------------- */}
      <Field label="Prénom et âge" htmlFor="title" error={state.errors.title} required>
        <input
          ref={titleRef}
          id="title"
          name="title"
          type="text"
          maxLength={90}
          required
          defaultValue={listing?.title}
          placeholder="Mireille, 23 ans"
          className={INPUT}
        />
      </Field>

      <Field label="Accroche" htmlFor="highlight" hint="Affichée sur la carte, ex. « Sorties & soirées »">
        <input
          id="highlight"
          name="highlight"
          type="text"
          maxLength={60}
          defaultValue={listing?.highlight ?? ""}
          className={INPUT}
        />
      </Field>

      <Field label="Description" htmlFor="description" error={state.errors.description} required>
        <textarea
          id="description"
          name="description"
          rows={6}
          required
          defaultValue={listing?.description}
          className={cx(INPUT, "resize-y")}
          placeholder="Présentez le profil, les services proposés et les conditions de rencontre…"
        />
      </Field>

      {/* Classement ---------------------------------------------------- */}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Catégorie" htmlFor="category" required>
          <select id="category" name="category" required className={INPUT} defaultValue={listing?.category ?? ""}>
            <option value="" disabled>Choisir…</option>
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>{c.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Formule" htmlFor="option_type" required>
          <select id="option_type" name="option_type" required className={INPUT} defaultValue={listing?.option_type ?? ""}>
            <option value="" disabled>Choisir…</option>
            {OPTION_TYPES.map((o) => (
              <option key={o.slug} value={o.slug}>{o.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Type de service" htmlFor="mobility" required>
          <select id="mobility" name="mobility" required className={INPUT} defaultValue={listing?.mobility ?? ""}>
            <option value="" disabled>Choisir…</option>
            {MOBILITIES.map((m) => (
              <option key={m.slug} value={m.slug}>{m.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Ville" htmlFor="city" error={state.errors.city} required>
          <select id="city" name="city" required className={INPUT} defaultValue={listing?.city ?? ""}>
            <option value="" disabled>Choisir…</option>
            {CITIES.map((c) => (
              <option key={c.slug} value={c.slug}>{c.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Quartier" htmlFor="district" hint="Facultatif">
          <input
            id="district"
            name="district"
            type="text"
            maxLength={60}
            defaultValue={listing?.district ?? ""}
            className={INPUT}
          />
        </Field>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Tarif (FCFA)" htmlFor="price_xaf" error={state.errors.price_xaf} required>
            <input
              id="price_xaf"
              name="price_xaf"
              type="number"
              min={0}
              step={1000}
              required
              inputMode="numeric"
              defaultValue={listing?.price_xaf}
              className={INPUT}
            />
          </Field>

          <Field label="Par" htmlFor="price_unit" required>
            <select
              id="price_unit"
              name="price_unit"
              required
              className={INPUT}
              defaultValue={listing?.price_unit ?? "night"}
            >
              {(Object.keys(PRICE_UNIT_LABEL) as Array<keyof typeof PRICE_UNIT_LABEL>).map((u) => (
                <option key={u} value={u}>{PRICE_UNIT_LABEL[u]}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* Grille tarifaire ---------------------------------------------- */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-slate-200">Grille tarifaire</h2>
          <span className="text-xs text-slate-500">
            Facultatif — à défaut, le tarif ci-dessus est repris
          </span>
        </div>

        <div className="space-y-2">
          {rates.map((rate, index) => (
            <div key={index} className="flex gap-2">
              <input
                name="rate_label"
                defaultValue={rate.label}
                placeholder="Séance de 60 minutes"
                maxLength={60}
                className={cx(INPUT, "flex-1")}
                aria-label={`Intitulé du tarif ${index + 1}`}
              />
              <input
                name="rate_amount"
                type="number"
                min={0}
                step={1000}
                defaultValue={rate.amount_xaf}
                className={cx(INPUT, "w-32")}
                aria-label={`Montant du tarif ${index + 1}`}
              />
              <select
                name="rate_unit"
                defaultValue={rate.unit}
                className={cx(INPUT, "w-32")}
                aria-label={`Unité du tarif ${index + 1}`}
              >
                {(Object.keys(PRICE_UNIT_LABEL) as Array<keyof typeof PRICE_UNIT_LABEL>).map((u) => (
                  <option key={u} value={u}>{PRICE_UNIT_LABEL[u]}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setRates((prev) => prev.filter((_, i) => i !== index))}
                aria-label={`Supprimer le tarif ${index + 1}`}
                className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/10 text-slate-500 transition hover:bg-white/[0.08] hover:text-white"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>

        {rates.length < MAX_RATES && (
          <button
            type="button"
            onClick={() =>
              setRates((prev) => [...prev, { label: "", amount_xaf: 0, unit: "service" }])
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-slate-300 transition hover:bg-white/[0.09] hover:text-white"
          >
            <Plus className="size-4" aria-hidden />
            Ajouter une ligne
          </button>
        )}
      </section>

      {/* Attributs ------------------------------------------------------ */}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Langues parlées" htmlFor="languages" hint="Séparées par des virgules">
          <input
            id="languages"
            name="languages"
            type="text"
            defaultValue={listing?.languages.join(", ") ?? ""}
            placeholder="Français, Lingala, Anglais"
            className={INPUT}
          />
        </Field>

        <Field label="Disponibilités" htmlFor="availability" hint="Séparées par des virgules">
          <input
            id="availability"
            name="availability"
            type="text"
            defaultValue={listing?.availability.join(", ") ?? ""}
            placeholder="Lun–Ven, Week-end, 24 h/24"
            className={INPUT}
          />
        </Field>
      </div>

      <Field
        label="Services et préférences"
        htmlFor="amenities"
        hint="Séparés par des virgules — affichés en fiche détail"
      >
        <input
          id="amenities"
          name="amenities"
          type="text"
          defaultValue={listing?.amenities.join(", ") ?? ""}
          placeholder="Discrétion, accompagnement, détente, sorties"
          className={INPUT}
        />
      </Field>

      <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <input
          type="checkbox"
          name="is_available_now"
          defaultChecked={listing?.is_available_now ?? false}
          className="mt-0.5 size-4 accent-neon"
        />
        <span className="text-sm text-slate-300">
          Disponible immédiatement
          <span className="mt-0.5 block text-xs text-slate-500">
            Affiche une pastille verte sur votre carte. À décocher dès que le profil n&apos;est
            plus disponible dans la journée — une pastille qui ment coûte plus qu&apos;elle ne
            rapporte.
          </span>
        </span>
      </label>

      <label
        className={cx(
          "flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4",
          !canPublish && "opacity-70",
        )}
      >
        <input
          type="checkbox"
          name="publish"
          disabled={!canPublish}
          defaultChecked={canPublish && (listing ? listing.status === "published" : true)}
          className="mt-0.5 size-4 accent-neon"
        />
        <span className="text-sm text-slate-300">
          Publier
          <span className="mt-0.5 block text-xs text-slate-500">
            {canPublish
              ? "Décochez pour repasser en brouillon. Un profil en brouillon n'apparaît pas dans le catalogue."
              : "Vérifiez votre identité pour publier. D'ici là, le profil est enregistré en brouillon."}
          </span>
        </span>
      </label>

      {!canPublish && (
        <Link
          href="/partenaire/verification"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-300/40 px-4 text-sm font-medium text-amber-100 transition hover:bg-amber-500/10"
        >
          Vérifier mon identité
        </Link>
      )}

      <SubmitButton disabled={uploading || images.length === 0} isEdit={isEdit} canPublish={canPublish} />
    </form>
  );
}

/* -------------------------------------------------------------------------- */

const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white " +
  "placeholder:text-slate-600 backdrop-blur-md transition " +
  "focus:border-neon/50 focus:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-neon/30";

function Field({
  label,
  htmlFor,
  error,
  hint,
  required = false,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-medium text-slate-200">
          {label}
          {required && <span className="ml-1 text-red-400">*</span>}
        </label>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

function SubmitButton({
  disabled,
  isEdit,
  canPublish,
}: {
  disabled: boolean;
  isEdit: boolean;
  canPublish: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={cx(
        "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl",
        "bg-action text-sm font-semibold text-slate-950",
        "shadow-[0_8px_30px_-10px_rgb(233_200_119/0.55)] transition hover:brightness-110",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Save className="size-4" aria-hidden />
      )}
      {isEdit ? "Enregistrer les modifications" : canPublish ? "Publier le profil" : "Enregistrer le brouillon"}
    </button>
  );
}
