# Vérification d'identité par selfie vidéo — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** rendre la publication d'une annonce conditionnelle à une vérification d'âge et d'identité par selfie vidéo, examinée par un administrateur, et faire du badge « Certifié » la conséquence de cette vérification.

**Architecture :** la base porte toutes les règles. Une table `verification_requests` n'est modifiable que par des fonctions `SECURITY DEFINER` ; un trigger interdit la publication sans compte vérifié ; la policy de lecture publique applique le délai de grâce sans tâche planifiée. La vidéo transite directement du navigateur vers un bucket Storage privé, est lue par l'administrateur via URL signée, puis supprimée avec `service_role` dès la décision.

**Tech Stack :** Next.js 15 (App Router, Server Actions) · React 19 · Supabase (Postgres 17, RLS, Storage) · Tailwind v4 · Vitest · pgTAP · Playwright.

**Spec :** `docs/superpowers/specs/2026-09-16-verification-identite-design.md`

## Global Constraints

- Migration unique : `supabase/migrations/0010_identity_verification.sql`.
- Bucket `verifications` : privé, `file_size_limit = 52428800` (50 Mo), types `video/mp4`, `video/quicktime`, `video/webm`, `video/3gpp`.
- Chemin d'objet : `<user_id>/<request_id>.<ext>`, `ext ∈ {mp4, mov, webm, 3gp}`.
- Code de défi : 6 caractères de l'alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, valable 30 minutes.
- Durée vidéo contrôlée côté navigateur : ≤ 20 s ; durée illisible → acceptée.
- URL signée administrateur : 300 secondes.
- Délai de grâce des annonces existantes : 7 jours.
- Fichiers orphelins purgeables après 24 h.
- Aucun numéro de pièce ni date de naissance stockés.
- Tout type de ligne Supabase est un **alias `type`**, jamais une `interface`, et chaque table déclare `Relationships` (piège n° 4 du README).
- Un module `"use server"` n'exporte que des fonctions async (piège n° 6) : états initiaux et constantes vivent dans `src/lib/` ou `src/types/`.
- Toute table nouvelle accorde explicitement ses droits à `service_role` (piège n° 2).
- Libellés d'interface en français. Le badge public s'appelle « Certifié » (`VerifiedBadge`).
- **Le working tree contient des modifications étrangères à ce chantier** (`src/app/layout.tsx`, `src/types/listing.ts`, `src/types/index.ts`, `src/lib/__mocks__/`, `src/components/listings/PrivateGallery.tsx`, `WhatsAppDirectButton.tsx`, `src/components/ui/EmergencyDiscretionButton.tsx`, `package.json`, `package-lock.json`). Ne jamais les indexer : **`git add` avec chemins explicites uniquement**, jamais `git add -A` ni `git add .`.
- Messages de commit terminés par la ligne `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Carte des fichiers

| Fichier | Responsabilité |
|---|---|
| `supabase/migrations/0010_identity_verification.sql` | Types, tables, trigger, policies, fonctions, bucket |
| `supabase/tests/verification.test.sql` | Propriétés de sécurité de la vérification |
| `supabase/tests/security.test.sql` | Fixture existante adaptée (annonce certifiée) |
| `supabase/seed.sql` | Annonces de démo non certifiées, en délai de grâce |
| `src/types/verification.ts` | Domaine : statuts, pièces, motifs, décisions et leurs libellés |
| `src/types/database.ts` | Schéma typé : table, colonnes, RPC, enums |
| `src/lib/verification.ts` (+ `.test.ts`) | Logique pure : contrôle vidéo, chemins, erreurs, vue, délai, purge |
| `src/lib/verification-storage.ts` | Accès Storage `service_role` (`server-only`) |
| `src/app/actions/verification.ts` | Server Actions partenaire |
| `src/app/actions/admin.ts` | Server Actions administrateur (décision, URL signée, purge, révocation) |
| `src/app/partenaire/verification/page.tsx` | Parcours partenaire |
| `src/components/verification/VerificationUpload.tsx` | Capture, contrôle et envoi de la vidéo |
| `src/components/verification/VerificationBanner.tsx` | Bandeau du tableau de bord |
| `src/components/verification/VerificationReview.tsx` | Lecteur vidéo et formulaire de décision |
| `src/components/verification/AdminVerificationSection.tsx` | Section `/admin` : file, purge, comptes vérifiés |
| `src/app/partenaire/page.tsx`, `annonces/nouvelle/page.tsx`, `annonces/[id]/modifier/page.tsx` | Intégration partenaire |
| `src/components/partner/ListingForm.tsx`, `src/app/actions/listings.ts` | Publication conditionnelle |
| `src/app/admin/page.tsx` | Intégration admin, retrait de la bascule « Vérifié » |
| `src/app/actions/account.ts`, `src/app/api/mon-compte/export/route.ts` | Cycle de vie des données |
| `e2e/constants.ts`, `e2e/global-setup.ts`, `e2e/helpers.ts`, `e2e/partenaire.spec.ts`, `e2e/catalogue.spec.ts`, `e2e/verification.spec.ts` | Bout en bout |
| `README.md` | Documentation |

---

### Task 0 : Préparer l'environnement et mesurer la ligne de base

**Files :** aucun.

- [ ] **Step 1 : Démarrer Docker puis la stack locale**

Lancer Docker Desktop, puis :

```bash
supabase start
supabase db reset
```

Expected : `Finished supabase db reset on branch …`.

- [ ] **Step 2 : Se placer sur la branche du chantier**

```bash
git switch feat/verification-identite
git status --short
```

Expected : branche `feat/verification-identite`, et la liste des modifications étrangères citées dans *Global Constraints*. Ne pas y toucher.

- [ ] **Step 3 : Mesurer la ligne de base**

```bash
npm run check 2>&1 | tail -20
npm run test:db 2>&1 | tail -5
```

Noter dans le compte rendu de tâche le nombre de tests verts et **toute erreur préexistante** (en particulier des erreurs `tsc` provenant des fichiers étrangers). Ces erreurs ne sont pas à corriger dans ce chantier ; les tâches suivantes doivent seulement ne pas en ajouter.

---

### Task 1 : Domaine et logique pure

**Files :**
- Create : `src/types/verification.ts`
- Create : `src/lib/verification.ts`
- Test : `src/lib/verification.test.ts`

**Interfaces :**
- Produces (`@/types/verification`) : `VerificationStatus`, `VerificationDocument`, `VerificationRejection`, `VerificationDecision`, `VERIFICATION_DOCUMENTS`, `REJECTION_REASONS`, `ADMIN_REJECT_OPTIONS`, `documentLabel(slug)`, `rejectionReason(slug)`, `isVerificationDocument(v)`, `isRejectionReason(v)`, `isVerificationDecision(v)`.
- Produces (`@/lib/verification`) : `VERIFICATION_BUCKET = "verifications"`, `MAX_VIDEO_BYTES`, `MAX_VIDEO_SECONDS`, `checkVideo(file: { type: string; size: number }, durationSeconds: number | null): VideoCheck`, `verificationVideoPath(userId, requestId, extension): string`, `verificationErrorCode(message): VerificationErrorCode | null`, `verificationErrorMessage(message): string`, `verificationView(latest: LatestVerification | null, now: Date): VerificationView`, `graceSummary(listings, now): { deadline: Date; count: number } | null`, `APPROVAL_CHECKS`, `hasAllApprovalChecks(fd: FormData): boolean`, `planVideoPurge(files: StoredVideo[], refs: VideoReference[], now: Date): { paths: string[]; clearRequestIds: string[] }`, types `VerificationFormState`, `StoredVideo`, `VideoReference`, `LatestVerification`, constante `INITIAL_VERIFICATION_STATE`.

- [ ] **Step 1 : Écrire le domaine**

`src/types/verification.ts` :

```ts
/**
 * Domaine de la vérification d'identité.
 *
 * Les slugs reprennent à l'identique les enums Postgres de la migration 0010 ;
 * les libellés sont centralisés ici, comme ceux des annonces dans `listing.ts`.
 */

export type VerificationStatus = "awaiting_video" | "pending" | "approved" | "rejected" | "revoked";

export type VerificationDecision = "approve" | "reject" | "block_minor" | "revoke";

export const VERIFICATION_DOCUMENTS = [
  { slug: "cni", label: "Carte nationale d'identité" },
  { slug: "passeport", label: "Passeport" },
  { slug: "carte_consulaire", label: "Carte consulaire" },
] as const;

export type VerificationDocument = (typeof VERIFICATION_DOCUMENTS)[number]["slug"];

export const REJECTION_REASONS = [
  {
    slug: "video_illisible",
    label: "Vidéo illisible",
    partner: "La vidéo était floue, trop sombre ou coupée.",
  },
  {
    slug: "piece_non_visible",
    label: "Pièce non visible",
    partner: "La pièce d'identité ou sa date de naissance n'était pas lisible.",
  },
  {
    slug: "code_absent_ou_faux",
    label: "Code absent ou faux",
    partner: "Le code affiché n'a pas été prononcé distinctement.",
  },
  {
    slug: "personne_differente",
    label: "Personne différente des photos",
    partner: "La personne filmée ne correspond pas aux photos de vos profils.",
  },
  {
    slug: "personne_mineure",
    label: "Personne mineure",
    partner: "",
  },
] as const;

export type VerificationRejection = (typeof REJECTION_REASONS)[number]["slug"];

/**
 * Motifs proposés au rejet simple. Le constat de minorité passe par une
 * décision distincte (`block_minor`), qui archive et bloque le compte.
 */
export const ADMIN_REJECT_OPTIONS = REJECTION_REASONS.filter(
  (reason) => reason.slug !== "personne_mineure",
);

export const documentLabel = (slug: string): string =>
  VERIFICATION_DOCUMENTS.find((d) => d.slug === slug)?.label ?? slug;

export const rejectionReason = (slug: string) =>
  REJECTION_REASONS.find((r) => r.slug === slug) ?? null;

export const isVerificationDocument = (v: unknown): v is VerificationDocument =>
  typeof v === "string" && VERIFICATION_DOCUMENTS.some((d) => d.slug === v);

export const isRejectionReason = (v: unknown): v is VerificationRejection =>
  typeof v === "string" && REJECTION_REASONS.some((r) => r.slug === v);

const DECISIONS: readonly VerificationDecision[] = ["approve", "reject", "block_minor", "revoke"];

export const isVerificationDecision = (v: unknown): v is VerificationDecision =>
  typeof v === "string" && (DECISIONS as readonly string[]).includes(v);
```

- [ ] **Step 2 : Écrire les tests (qui doivent échouer)**

`src/lib/verification.test.ts` :

```ts
import { describe, expect, it } from "vitest";

import {
  checkVideo,
  graceSummary,
  hasAllApprovalChecks,
  MAX_VIDEO_BYTES,
  planVideoPurge,
  verificationErrorCode,
  verificationErrorMessage,
  verificationVideoPath,
  verificationView,
} from "@/lib/verification";
import { isRejectionReason, isVerificationDecision, isVerificationDocument } from "@/types/verification";

const NOW = new Date("2026-09-16T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe("checkVideo", () => {
  it("accepte une vidéo MP4 de 15 s et renvoie son extension", () => {
    expect(checkVideo({ type: "video/mp4", size: 30_000_000 }, 15)).toEqual({ ok: true, extension: "mp4" });
  });

  it("associe chaque type autorisé à son extension", () => {
    expect(checkVideo({ type: "video/quicktime", size: 1 }, 1)).toEqual({ ok: true, extension: "mov" });
    expect(checkVideo({ type: "video/webm", size: 1 }, 1)).toEqual({ ok: true, extension: "webm" });
    expect(checkVideo({ type: "video/3gpp", size: 1 }, 1)).toEqual({ ok: true, extension: "3gp" });
  });

  it("refuse un type non vidéo", () => {
    expect(checkVideo({ type: "image/png", size: 1 }, null).ok).toBe(false);
  });

  it("refuse un fichier vide", () => {
    expect(checkVideo({ type: "video/mp4", size: 0 }, 5).ok).toBe(false);
  });

  it("accepte exactement 50 Mo et refuse au-delà", () => {
    expect(checkVideo({ type: "video/mp4", size: MAX_VIDEO_BYTES }, 10).ok).toBe(true);
    expect(checkVideo({ type: "video/mp4", size: MAX_VIDEO_BYTES + 1 }, 10).ok).toBe(false);
  });

  it("accepte exactement 20 s et refuse au-delà", () => {
    expect(checkVideo({ type: "video/mp4", size: 1 }, 20).ok).toBe(true);
    expect(checkVideo({ type: "video/mp4", size: 1 }, 20.5).ok).toBe(false);
  });

  it("accepte une durée illisible, la taille restant plafonnée", () => {
    expect(checkVideo({ type: "video/mp4", size: 1 }, null).ok).toBe(true);
  });
});

describe("verificationVideoPath", () => {
  it("range la vidéo dans le dossier du compte, nommée d'après la demande", () => {
    expect(verificationVideoPath("u-1", "r-2", "mov")).toBe("u-1/r-2.mov");
  });
});

describe("verificationErrorCode / verificationErrorMessage", () => {
  it("reconnaît un code dans le message Postgres", () => {
    expect(verificationErrorCode("code_expired")).toBe("code_expired");
    expect(verificationErrorCode('new row: verification_required')).toBe("verification_required");
  });

  it("ne confond pas un message inconnu avec un code", () => {
    expect(verificationErrorCode("toString")).toBeNull();
    expect(verificationErrorCode(undefined)).toBeNull();
  });

  it("renvoie un message de repli pour une erreur inconnue", () => {
    expect(verificationErrorMessage("boom")).toBe("Une erreur est survenue. Réessayez dans un instant.");
  });

  it("traduit un refus de publication", () => {
    expect(verificationErrorMessage("verification_required")).toContain("Vérifiez votre identité");
  });
});

describe("verificationView", () => {
  const base = { code_expires_at: hoursAgo(-0.25), rejection_reason: null };

  it("propose de commencer sans demande", () => {
    expect(verificationView(null, NOW)).toBe("start");
  });

  it("affiche l'envoi tant que le code est valide, puis l'expiration", () => {
    expect(verificationView({ ...base, status: "awaiting_video" }, NOW)).toBe("upload");
    expect(verificationView({ ...base, status: "awaiting_video", code_expires_at: hoursAgo(1) }, NOW)).toBe("expired");
  });

  it("reflète les états terminaux", () => {
    expect(verificationView({ ...base, status: "pending" }, NOW)).toBe("pending");
    expect(verificationView({ ...base, status: "approved" }, NOW)).toBe("approved");
    expect(verificationView({ ...base, status: "revoked" }, NOW)).toBe("revoked");
    expect(verificationView({ ...base, status: "rejected", rejection_reason: "video_illisible" }, NOW)).toBe("rejected");
  });

  it("présente un constat de minorité comme un blocage", () => {
    expect(verificationView({ ...base, status: "rejected", rejection_reason: "personne_mineure" }, NOW)).toBe("blocked");
  });
});

describe("graceSummary", () => {
  it("renvoie la plus proche échéance future et le nombre d'annonces concernées", () => {
    const soon = new Date(NOW.getTime() + 86_400_000).toISOString();
    const later = new Date(NOW.getTime() + 3 * 86_400_000).toISOString();

    const summary = graceSummary(
      [
        { status: "published", is_verified: false, verification_grace_until: later },
        { status: "published", is_verified: false, verification_grace_until: soon },
        { status: "published", is_verified: false, verification_grace_until: hoursAgo(1) },
        { status: "draft", is_verified: false, verification_grace_until: soon },
        { status: "published", is_verified: true, verification_grace_until: null },
      ],
      NOW,
    );

    expect(summary).toEqual({ deadline: new Date(soon), count: 2 });
  });

  it("renvoie null sans annonce en délai de grâce", () => {
    expect(graceSummary([], NOW)).toBeNull();
  });
});

describe("hasAllApprovalChecks", () => {
  it("exige les quatre contrôles", () => {
    const fd = new FormData();
    fd.set("check_face", "on");
    fd.set("check_document", "on");
    fd.set("check_age", "on");
    expect(hasAllApprovalChecks(fd)).toBe(false);

    fd.set("check_code", "on");
    expect(hasAllApprovalChecks(fd)).toBe(true);
  });
});

describe("planVideoPurge", () => {
  it("conserve les vidéos en examen, purge celles déjà jugées et les orphelines de plus de 24 h", () => {
    const plan = planVideoPurge(
      [
        { path: "u/pending.mp4", createdAt: hoursAgo(72) },
        { path: "u/approved.mp4", createdAt: hoursAgo(1) },
        { path: "u/orphan-old.mp4", createdAt: hoursAgo(25) },
        { path: "u/orphan-new.mp4", createdAt: hoursAgo(2) },
      ],
      [
        { id: "p", status: "pending", video_path: "u/pending.mp4" },
        { id: "a", status: "approved", video_path: "u/approved.mp4" },
        { id: "r", status: "rejected", video_path: "u/deja-supprimee.mp4" },
      ],
      NOW,
    );

    expect(plan.paths.sort()).toEqual(["u/approved.mp4", "u/orphan-old.mp4"]);
    expect(plan.clearRequestIds.sort()).toEqual(["a", "r"]);
  });
});

describe("gardes de type", () => {
  it("valident les slugs du domaine", () => {
    expect(isVerificationDocument("passeport")).toBe(true);
    expect(isVerificationDocument("permis")).toBe(false);
    expect(isRejectionReason("personne_mineure")).toBe(true);
    expect(isRejectionReason("autre")).toBe(false);
    expect(isVerificationDecision("block_minor")).toBe(true);
    expect(isVerificationDecision("delete")).toBe(false);
  });
});
```

- [ ] **Step 3 : Vérifier l'échec**

Run : `npx vitest run src/lib/verification.test.ts`
Expected : FAIL — `Failed to resolve import "@/lib/verification"`.

- [ ] **Step 4 : Implémenter**

`src/lib/verification.ts` :

```ts
import type {
  VerificationRejection,
  VerificationStatus,
} from "@/types/verification";

/**
 * Logique pure de la vérification d'identité, partagée entre le navigateur,
 * les Server Actions et les tests. Aucun accès réseau ici.
 */

export const VERIFICATION_BUCKET = "verifications";

/** Un iPhone filme en 1080p par défaut : environ 30 Mo pour 15 s. */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** 15 s demandées, avec une marge pour qui s'arrête un peu tard. */
export const MAX_VIDEO_SECONDS = 20;

export const ORPHAN_VIDEO_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Doit rester aligné sur `allowed_mime_types` du bucket (migration 0010). */
const VIDEO_EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/3gpp": "3gp",
};

export type VideoCheck = { ok: true; extension: string } | { ok: false; message: string };

/**
 * Contrôle avant envoi : évite de consommer des minutes de 3G pour un fichier
 * que le bucket refuserait. Une durée illisible (certains Android ne
 * l'exposent pas) n'est pas bloquante ; la limite de taille du bucket reste.
 */
export function checkVideo(
  file: { type: string; size: number },
  durationSeconds: number | null,
): VideoCheck {
  const extension = Object.hasOwn(VIDEO_EXTENSIONS, file.type) ? VIDEO_EXTENSIONS[file.type] : null;

  if (!extension) {
    return {
      ok: false,
      message: "Format non pris en charge. Filmez avec l'appareil photo du téléphone (MP4, MOV, WebM ou 3GP).",
    };
  }
  if (file.size === 0) {
    return { ok: false, message: "La vidéo est vide. Filmez-la à nouveau." };
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return { ok: false, message: "La vidéo dépasse 50 Mo. Filmez une séquence plus courte : 15 secondes suffisent." };
  }
  if (durationSeconds !== null && durationSeconds > MAX_VIDEO_SECONDS) {
    return { ok: false, message: "La vidéo dure plus de 20 secondes. 15 secondes suffisent." };
  }
  return { ok: true, extension };
}

/** Convention imposée par la policy Storage et revérifiée par `submit_verification`. */
export const verificationVideoPath = (userId: string, requestId: string, extension: string): string =>
  `${userId}/${requestId}.${extension}`;

const ERROR_MESSAGES = {
  verification_required: "Vérifiez votre identité avant de publier un profil.",
  code_expired: "Ce code a expiré. Demandez-en un nouveau et filmez à nouveau la vidéo.",
  video_missing: "La vidéo n'a pas été reçue. Relancez l'envoi.",
  invalid_path: "Envoi invalide. Rechargez la page et recommencez.",
  not_found: "Demande introuvable. Rechargez la page.",
  blocked: "La vérification n'est pas disponible pour ce compte. Contactez le support.",
  already_verified: "Votre identité est déjà vérifiée.",
  already_pending: "Une vérification est déjà en cours d'examen.",
  already_reviewed: "Cette demande a déjà été traitée.",
  reason_required: "Indiquez un motif.",
  invalid_reason: "Motif invalide pour cette décision.",
  invalid_decision: "Décision invalide.",
  forbidden: "Action non autorisée.",
} as const;

export type VerificationErrorCode = keyof typeof ERROR_MESSAGES;

const FALLBACK_MESSAGE = "Une erreur est survenue. Réessayez dans un instant.";

/** PostgREST renvoie le texte du `raise exception` dans `error.message`. */
export function verificationErrorCode(message: string | null | undefined): VerificationErrorCode | null {
  if (!message) return null;
  const codes = Object.keys(ERROR_MESSAGES) as VerificationErrorCode[];
  return codes.find((code) => message.includes(code)) ?? null;
}

export function verificationErrorMessage(message: string | null | undefined): string {
  const code = verificationErrorCode(message);
  return code ? ERROR_MESSAGES[code] : FALLBACK_MESSAGE;
}

export type VerificationView =
  | "start"
  | "upload"
  | "expired"
  | "pending"
  | "approved"
  | "rejected"
  | "revoked"
  | "blocked";

export type LatestVerification = {
  status: VerificationStatus;
  code_expires_at: string;
  rejection_reason: VerificationRejection | null;
};

export function verificationView(latest: LatestVerification | null, now: Date): VerificationView {
  if (!latest) return "start";

  switch (latest.status) {
    case "awaiting_video":
      return new Date(latest.code_expires_at) < now ? "expired" : "upload";
    case "pending":
      return "pending";
    case "approved":
      return "approved";
    case "revoked":
      return "revoked";
    case "rejected":
      // `block_minor` enregistre un rejet motivé par la minorité et bloque le compte.
      return latest.rejection_reason === "personne_mineure" ? "blocked" : "rejected";
  }
}

/** Plus proche échéance de masquage parmi les annonces encore en délai de grâce. */
export function graceSummary(
  listings: { status: string; is_verified: boolean; verification_grace_until: string | null }[],
  now: Date,
): { deadline: Date; count: number } | null {
  const deadlines = listings
    .filter((l) => l.status === "published" && !l.is_verified && l.verification_grace_until)
    .map((l) => new Date(l.verification_grace_until!))
    .filter((d) => d > now)
    .sort((a, b) => a.getTime() - b.getTime());

  return deadlines.length > 0 ? { deadline: deadlines[0], count: deadlines.length } : null;
}

export const APPROVAL_CHECKS = [
  { name: "check_face", label: "Le visage correspond aux photos des annonces" },
  { name: "check_document", label: "La pièce est lisible et paraît authentique" },
  { name: "check_age", label: "La date de naissance indique 18 ans ou plus" },
  { name: "check_code", label: "Le code prononcé est le bon" },
] as const;

/** Revérifié côté serveur : une case désactivée dans l'interface ne protège rien. */
export const hasAllApprovalChecks = (formData: FormData): boolean =>
  APPROVAL_CHECKS.every(({ name }) => formData.get(name) === "on");

export type StoredVideo = { path: string; createdAt: string };

export type VideoReference = { id: string; status: VerificationStatus; video_path: string | null };

const FINAL_STATUSES: readonly VerificationStatus[] = ["approved", "rejected", "revoked"];

/**
 * Vidéos à supprimer et demandes dont `video_path` doit être remis à null.
 *
 * — en examen (`pending`) : conservée ;
 * — déjà jugée : supprimée, quel que soit son âge ;
 * — sans demande en examen (dépôt abandonné, demande remplacée) : supprimée
 *   après 24 h, pour ne pas couper un envoi en cours de finalisation.
 */
export function planVideoPurge(
  files: StoredVideo[],
  refs: VideoReference[],
  now: Date,
): { paths: string[]; clearRequestIds: string[] } {
  const byPath = new Map(
    refs.filter((r) => r.video_path).map((r) => [r.video_path as string, r]),
  );

  const paths = files
    .filter((file) => {
      const ref = byPath.get(file.path);
      if (ref?.status === "pending") return false;
      if (ref && FINAL_STATUSES.includes(ref.status)) return true;
      return now.getTime() - new Date(file.createdAt).getTime() > ORPHAN_VIDEO_MAX_AGE_MS;
    })
    .map((file) => file.path);

  const clearRequestIds = refs
    .filter((r) => r.video_path && FINAL_STATUSES.includes(r.status))
    .map((r) => r.id);

  return { paths, clearRequestIds };
}

/** Hors du module `"use server"`, qui ne peut exporter que des fonctions async. */
export type VerificationFormState = {
  status: "idle" | "error" | "success";
  message: string | null;
};

export const INITIAL_VERIFICATION_STATE: VerificationFormState = { status: "idle", message: null };
```

- [ ] **Step 5 : Vérifier le succès**

Run : `npx vitest run src/lib/verification.test.ts`
Expected : PASS, tous les tests verts.

- [ ] **Step 6 : Commit**

```bash
git add src/types/verification.ts src/lib/verification.ts src/lib/verification.test.ts
git commit -m "feat(verification): domaine et logique pure de la vérification d'identité

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2 : Base de données — migration, tests pgTAP, seed

**Files :**
- Create : `supabase/tests/verification.test.sql`
- Create : `supabase/migrations/0010_identity_verification.sql`
- Modify : `supabase/tests/security.test.sql` (fixture d'annonce, lignes 31-44)
- Modify : `supabase/seed.sql` (fin de fichier + descriptions)

**Interfaces :**
- Produces (SQL) :
  - `public.is_account_verified(p_user_id uuid) returns boolean`
  - `public.start_verification() returns table (id uuid, challenge_code text, code_expires_at timestamptz)`
  - `public.submit_verification(p_id uuid, p_document verification_document, p_video_path text) returns void`
  - `public.review_verification(p_id uuid, p_decision text, p_reason verification_rejection default null, p_note text default null) returns text`
  - `public.clear_verification_video(p_id uuid) returns void`
  - Colonne `listings.verification_grace_until timestamptz`
  - Erreurs levées : `forbidden`, `blocked`, `already_verified`, `already_pending`, `not_found`, `code_expired`, `invalid_path`, `video_missing`, `invalid_decision`, `already_reviewed`, `reason_required`, `invalid_reason`, `verification_required`, `listing_unavailable`.

- [ ] **Step 1 : Écrire les tests pgTAP (qui doivent échouer)**

`supabase/tests/verification.test.sql` :

```sql
-- Propriétés de sécurité de la vérification d'identité.
--
-- Exécution :  supabase test db     (nécessite `supabase start`)
--
-- Ce qui est verrouillé ici : personne ne se déclare vérifié soi-même, une
-- annonce non vérifiée disparaît à l'issue du délai de grâce, la vidéo d'un
-- compte n'est lisible que par l'équipe, et chaque décision est tracée.

begin;
select plan(45);

-- Jeu d'essai ---------------------------------------------------------------
-- p1 : partenaire à vérifier · p2 : tiers, puis compte mineur · adm : administrateur
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, phone_change_token, reauthentication_token,
  email_change, phone_change, email_confirmed_at, created_at, updated_at
) values
  ('0a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'verif-p1@test.cg', 'x',
   '', '', '', '', '', '', '', '', now(), now(), now()),
  ('0a000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'verif-p2@test.cg', 'x',
   '', '', '', '', '', '', '', '', now(), now(), now()),
  ('0a000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'verif-admin@test.cg', 'x',
   '', '', '', '', '', '', '', '', now(), now(), now());

insert into public.admins (user_id) values ('0a000000-0000-0000-0000-000000000003');

-- Insérées en superutilisateur : le trigger ne s'applique pas, ce qui permet
-- de poser directement l'état « publiée en délai de grâce ».
insert into public.listings (
  id, slug, title, description, category, option_type, mobility, city,
  price_xaf, price_unit, cover_url, status, owner_id, is_verified, verification_grace_until
) values
  ('0b000000-0000-0000-0000-000000000001', 'verif-publiee', 'Annonce en grâce',
   'Description suffisamment longue pour la validation applicative.',
   'categorie-a', 'option_1', 'sur_place', 'brazzaville', 40000, 'hour',
   'https://exemple/v1.jpg', 'published', '0a000000-0000-0000-0000-000000000001',
   false, now() + interval '7 days'),
  ('0b000000-0000-0000-0000-000000000002', 'verif-brouillon', 'Annonce brouillon',
   'Description suffisamment longue pour la validation applicative.',
   'categorie-b', 'option_2', 'sur_place', 'brazzaville', 30000, 'hour',
   'https://exemple/v2.jpg', 'draft', '0a000000-0000-0000-0000-000000000001',
   false, null),
  ('0b000000-0000-0000-0000-000000000004', 'verif-mineur', 'Annonce du compte mineur',
   'Description suffisamment longue pour la validation applicative.',
   'categorie-c', 'option_3', 'sur_place', 'pointe-noire', 30000, 'hour',
   'https://exemple/v4.jpg', 'published', '0a000000-0000-0000-0000-000000000002',
   false, now() + interval '7 days');

/* -------------------------------------------------------------------------- */
/*                              Délai de grâce                                */
/* -------------------------------------------------------------------------- */

set local role anon;

select is(
  (select count(*)::int from public.listings where slug = 'verif-publiee'),
  1,
  'une annonce non vérifiée reste visible pendant le délai de grâce'
);

reset role;
update public.listings set verification_grace_until = now() - interval '1 minute'
 where slug = 'verif-publiee';
set local role anon;

select is(
  (select count(*)::int from public.listings where slug = 'verif-publiee'),
  0,
  'une fois le délai écoulé, l''annonce disparaît du catalogue sans tâche planifiée'
);

select throws_ok(
  $$ select submit_request('0b000000-0000-0000-0000-000000000001'::uuid,
       'Client Test', '+242 06 404 40 40', null, '', null::date, null::smallint) $$,
  'listing_unavailable',
  'une annonce masquée ne peut plus recevoir de demande'
);

reset role;
update public.listings set verification_grace_until = now() + interval '7 days'
 where slug = 'verif-publiee';

/* -------------------------------------------------------------------------- */
/*                          Publication conditionnelle                        */
/* -------------------------------------------------------------------------- */

set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ update public.listings set title = 'Annonce en grâce modifiée'
      where slug = 'verif-publiee' $$,
  'un partenaire en délai de grâce peut modifier son annonce publiée'
);

select throws_ok(
  $$ update public.listings set status = 'published' where slug = 'verif-brouillon' $$,
  'verification_required',
  'un compte non vérifié ne peut pas publier un brouillon'
);

select throws_ok(
  $$ insert into public.listings (slug, title, description, category, option_type, mobility,
       city, price_xaf, price_unit, cover_url, status, owner_id)
     values ('verif-nouvelle', 'Nouvelle annonce',
       'Description suffisamment longue pour la validation applicative.',
       'categorie-a', 'option_1', 'sur_place', 'brazzaville', 20000, 'hour',
       'https://exemple/v3.jpg', 'published', '0a000000-0000-0000-0000-000000000001') $$,
  'verification_required',
  'un compte non vérifié ne peut pas créer une annonce publiée'
);

select lives_ok(
  $$ update public.listings set status = 'draft' where slug = 'verif-publiee' $$,
  'un partenaire non vérifié peut dépublier son annonce'
);

select throws_ok(
  $$ update public.listings set status = 'published' where slug = 'verif-publiee' $$,
  'verification_required',
  'une annonce repassée en brouillon ne peut plus être republiée sans vérification'
);

select throws_ok(
  $$ update public.listings set verification_grace_until = now() + interval '1 year'
      where slug = 'verif-brouillon' $$,
  '42501',
  null,
  'un partenaire ne peut pas prolonger son délai de grâce'
);

select throws_ok(
  $$ insert into public.verification_requests (user_id, challenge_code, status)
     values ('0a000000-0000-0000-0000-000000000001', 'AAAAAA', 'approved') $$,
  '42501',
  null,
  'un partenaire ne peut pas se déclarer vérifié en écrivant dans la table'
);

/* -------------------------------------------------------------------------- */
/*                           Démarrage et soumission                          */
/* -------------------------------------------------------------------------- */

select lives_ok(
  $$ select * from start_verification() $$,
  'un partenaire peut démarrer une vérification'
);

select ok(
  (select challenge_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'
     from public.verification_requests
    where user_id = '0a000000-0000-0000-0000-000000000001' and status = 'awaiting_video'),
  'le code de défi compte 6 caractères sans ambiguïté'
);

select throws_ok(
  $$ select submit_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000001'),
       'cni',
       '0a000000-0000-0000-0000-000000000001/'
         || (select id from public.verification_requests
              where user_id = '0a000000-0000-0000-0000-000000000001')::text || '.mp4') $$,
  'video_missing',
  'la soumission exige une vidéo réellement déposée'
);

select throws_ok(
  $$ select submit_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000001'),
       'cni',
       '0a000000-0000-0000-0000-000000000002/'
         || (select id from public.verification_requests
              where user_id = '0a000000-0000-0000-0000-000000000001')::text || '.mp4') $$,
  'invalid_path',
  'la vidéo doit se trouver dans le dossier du compte et porter l''identifiant de la demande'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('verifications', '0a000000-0000-0000-0000-000000000002/intrus.mp4') $$,
  '42501',
  null,
  'un compte ne peut pas déposer dans le dossier d''un autre'
);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     select 'verifications', '0a000000-0000-0000-0000-000000000001/' || id::text || '.mp4'
       from public.verification_requests
      where user_id = '0a000000-0000-0000-0000-000000000001' $$,
  'un compte peut déposer sa vidéo dans son propre dossier'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'verifications'),
  0,
  'un compte ne relit pas sa propre vidéo : seule l''équipe y a accès'
);

reset role;
update public.verification_requests set code_expires_at = now() - interval '1 minute'
 where user_id = '0a000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select submit_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000001'),
       'cni',
       '0a000000-0000-0000-0000-000000000001/'
         || (select id from public.verification_requests
              where user_id = '0a000000-0000-0000-0000-000000000001')::text || '.mp4') $$,
  'code_expired',
  'un code expiré est refusé, ce qui empêche de recycler une ancienne vidéo'
);

reset role;
update public.verification_requests set code_expires_at = now() + interval '30 minutes'
 where user_id = '0a000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ select submit_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000001'),
       'cni',
       '0a000000-0000-0000-0000-000000000001/'
         || (select id from public.verification_requests
              where user_id = '0a000000-0000-0000-0000-000000000001')::text || '.mp4') $$,
  'avec un code valide et une vidéo déposée, la demande est soumise'
);

select is(
  (select status::text from public.verification_requests
    where user_id = '0a000000-0000-0000-0000-000000000001'),
  'pending',
  'la demande soumise passe en examen'
);

select throws_ok(
  $$ select * from start_verification() $$,
  'already_pending',
  'une seconde vérification ne peut pas être lancée pendant l''examen'
);

/* -------------------------------------------------------------------------- */
/*                                  Tiers                                     */
/* -------------------------------------------------------------------------- */

set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from public.verification_requests),
  0,
  'un tiers ne voit aucune demande de vérification qui ne le concerne pas'
);

select throws_ok(
  $$ select review_verification('00000000-0000-0000-0000-000000000000'::uuid, 'approve') $$,
  '42501',
  'forbidden',
  'un non-administrateur ne peut pas statuer sur une vérification'
);

/* -------------------------------------------------------------------------- */
/*                               Administration                               */
/* -------------------------------------------------------------------------- */

set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000003","role":"authenticated"}';

select is(
  (select count(*)::int from storage.objects where bucket_id = 'verifications'),
  1,
  'un administrateur peut lire la vidéo à examiner'
);

select throws_ok(
  $$ select review_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000001'), 'reject') $$,
  'reason_required',
  'un rejet sans motif est refusé'
);

select throws_ok(
  $$ select review_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000001'),
       'reject', 'personne_mineure') $$,
  'invalid_reason',
  'la minorité ne peut pas être traitée comme un rejet simple'
);

select is(
  (select review_verification(
     (select id from public.verification_requests
       where user_id = '0a000000-0000-0000-0000-000000000001'), 'approve')),
  (select '0a000000-0000-0000-0000-000000000001/' || id::text || '.mp4'
     from public.verification_requests
    where user_id = '0a000000-0000-0000-0000-000000000001'),
  'l''approbation renvoie le chemin de la vidéo à supprimer'
);

select throws_ok(
  $$ select review_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000001'), 'approve') $$,
  'already_reviewed',
  'une demande déjà jugée ne peut pas l''être une seconde fois'
);

reset role;

select ok(
  (select bool_and(is_verified) from public.listings
    where owner_id = '0a000000-0000-0000-0000-000000000001'),
  'l''approbation certifie toutes les annonces du compte'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ update public.listings set status = 'published' where slug = 'verif-publiee' $$,
  'un compte vérifié peut publier'
);

select lives_ok(
  $$ insert into public.listings (slug, title, description, category, option_type, mobility,
       city, price_xaf, price_unit, cover_url, status, owner_id)
     values ('verif-apres', 'Annonce après vérification',
       'Description suffisamment longue pour la validation applicative.',
       'categorie-a', 'option_1', 'sur_place', 'brazzaville', 20000, 'hour',
       'https://exemple/v5.jpg', 'published', '0a000000-0000-0000-0000-000000000001') $$,
  'un compte vérifié peut créer une annonce publiée'
);

reset role;

select is(
  (select is_verified from public.listings where slug = 'verif-apres'),
  true,
  'une nouvelle annonce d''un compte vérifié hérite du badge'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ select * from start_verification() $$,
  'already_verified',
  'un compte déjà vérifié ne relance pas de vérification'
);

/* -------------------------------------------------------------------------- */
/*                                Révocation                                  */
/* -------------------------------------------------------------------------- */

set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000003","role":"authenticated"}';

select throws_ok(
  $$ select review_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000001'), 'revoke') $$,
  'reason_required',
  'une révocation sans note est refusée'
);

select lives_ok(
  $$ select review_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000001'),
       'revoke', null, 'Pièce falsifiée constatée') $$,
  'un administrateur peut révoquer une vérification'
);

reset role;

select ok(
  (select not bool_or(is_verified) from public.listings
    where owner_id = '0a000000-0000-0000-0000-000000000001'),
  'la révocation retire le badge de toutes les annonces du compte'
);

set local role anon;

select is(
  (select count(*)::int from public.listings
    where owner_id = '0a000000-0000-0000-0000-000000000001'),
  0,
  'après révocation, les annonces du compte disparaissent du catalogue'
);

reset role;

/* -------------------------------------------------------------------------- */
/*                            Constat de minorité                             */
/* -------------------------------------------------------------------------- */

insert into public.verification_requests (user_id, status, challenge_code, document_type, video_path, submitted_at)
values ('0a000000-0000-0000-0000-000000000002', 'pending', 'MINEUR', 'cni',
        '0a000000-0000-0000-0000-000000000002/fixture.mp4', now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000003","role":"authenticated"}';

select lives_ok(
  $$ select review_verification(
       (select id from public.verification_requests
         where user_id = '0a000000-0000-0000-0000-000000000002'), 'block_minor') $$,
  'un administrateur peut signaler une personne mineure'
);

reset role;

select is(
  (select status::text from public.listings where slug = 'verif-mineur'),
  'archived',
  'constat de minorité : les annonces du compte sont archivées'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$ select * from start_verification() $$,
  'blocked',
  'un compte signalé mineur ne peut plus demander de vérification'
);

select is(
  (select count(*)::int from public.moderation_log where verification_id is not null),
  0,
  'le journal des décisions est invisible hors administration'
);

set local request.jwt.claims = '{"sub":"0a000000-0000-0000-0000-000000000003","role":"authenticated"}';

select is(
  (select count(*)::int from public.moderation_log where verification_id is not null),
  3,
  'approbation, révocation et constat de minorité sont journalisés'
);

select lives_ok(
  $$ select set_listing_certification('0b000000-0000-0000-0000-000000000004'::uuid, true, null) $$,
  'la fonction de certification reste appelable pour le VIP'
);

reset role;

select is(
  (select is_verified from public.listings where slug = 'verif-mineur'),
  false,
  'la bascule manuelle ne peut plus certifier une annonce'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.review_verification(uuid,text,verification_rejection,text)',
    'EXECUTE'),
  'le rôle anon ne peut pas appeler review_verification'
);

select * from finish();
rollback;
```

Compter les assertions : 45. Si un test est ajouté ou retiré, ajuster `plan(45)`.

- [ ] **Step 2 : Vérifier l'échec**

Run : `supabase test db`
Expected : FAIL sur `verification.test.sql` (`column "verification_grace_until" of relation "listings" does not exist`).

- [ ] **Step 3 : Écrire la migration**

`supabase/migrations/0010_identity_verification.sql` :

```sql
-- Vérification d'identité par selfie vidéo.
--
-- Jusqu'ici, `is_verified` était une bascule manuelle de l'équipe : le badge
-- attestait un contrôle que rien ne documentait, et rien n'empêchait une
-- personne mineure de publier. Cette migration rend la publication
-- conditionnelle à une vérification humaine de l'âge et de l'identité.
--
-- Principes :
--   1. Le compte est vérifié, pas l'annonce ; `listings.is_verified` devient une
--      copie dérivée, maintenue par `review_verification` et par un trigger.
--   2. Toute écriture passe par des fonctions SECURITY DEFINER, sur le modèle
--      de `submit_request` et `set_listing_certification`.
--   3. Le délai de grâce s'applique à la *lecture* (policy RLS) : aucune tâche
--      planifiée ne peut tomber en panne et laisser des profils non vérifiés
--      en ligne.
--   4. Minimisation : ni numéro de pièce ni date de naissance ; la vidéo est
--      supprimée dès la décision (par l'application, via l'API Storage).

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

create type public.verification_status as enum (
  'awaiting_video',  -- code émis, vidéo pas encore soumise
  'pending',         -- vidéo soumise, en attente d'examen
  'approved',
  'rejected',
  'revoked'          -- approbation retirée a posteriori
);

create type public.verification_document as enum ('cni', 'passeport', 'carte_consulaire');

create type public.verification_rejection as enum (
  'video_illisible',
  'piece_non_visible',
  'code_absent_ou_faux',
  'personne_differente',
  'personne_mineure'
);

/* -------------------------------------------------------------------------- */
/*                                  Tables                                    */
/* -------------------------------------------------------------------------- */

create table public.verification_requests (
  -- Sert aussi de nom de fichier : `<user_id>/<id>.<ext>`.
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  status           public.verification_status not null default 'awaiting_video',
  challenge_code   text not null,
  code_expires_at  timestamptz not null default now() + interval '30 minutes',
  document_type    public.verification_document,
  -- Remis à null une fois le fichier supprimé du bucket.
  video_path       text,
  submitted_at     timestamptz,
  reviewed_by      uuid references auth.users (id) on delete set null,
  reviewed_at      timestamptz,
  rejection_reason public.verification_rejection,
  rejection_note   text check (rejection_note is null or char_length(rejection_note) <= 300),
  created_at       timestamptz not null default now(),

  constraint verification_rejected_has_reason
    check (status <> 'rejected' or rejection_reason is not null)
);

-- Une seule demande en cours et une seule approbation active par compte.
create unique index verification_requests_one_open
  on public.verification_requests (user_id)
  where status in ('awaiting_video', 'pending');

create unique index verification_requests_one_approved
  on public.verification_requests (user_id)
  where status = 'approved';

create index verification_requests_queue_idx
  on public.verification_requests (submitted_at)
  where status = 'pending';

alter table public.verification_requests enable row level security;

create policy "verification_requests_self_read"
  on public.verification_requests for select
  using (user_id = auth.uid());

create policy "verification_requests_admin_read"
  on public.verification_requests for select
  using (public.is_admin());

revoke all on public.verification_requests from anon, authenticated;
grant select on public.verification_requests to authenticated;
grant select, insert, update, delete on public.verification_requests to service_role;

-- Comptes interdits de vérification après constat de minorité. Levée du
-- blocage : suppression manuelle de la ligne par un administrateur, en SQL.
create table public.verification_blocks (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  verification_id uuid references public.verification_requests (id) on delete set null,
  blocked_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

alter table public.verification_blocks enable row level security;

revoke all on public.verification_blocks from anon, authenticated;
grant select, insert, update, delete on public.verification_blocks to service_role;

/* -------------------------------------------------------------------------- */
/*                          Journal de modération                             */
/* -------------------------------------------------------------------------- */

-- Pas de clé étrangère vers `verification_requests` : la suppression d'un
-- compte ferait passer la colonne à null et violerait la contrainte de cible
-- unique. Même choix que pour `review_id`.
alter table public.moderation_log
  alter column review_id drop not null,
  alter column listing_id drop not null,
  add column verification_id uuid,
  add column action text not null default 'remove_review'
    check (action in ('remove_review', 'approve', 'reject', 'block_minor', 'revoke')),
  add constraint moderation_log_single_target
    check (num_nonnulls(review_id, verification_id) = 1);

/* -------------------------------------------------------------------------- */
/*                                 Annonces                                   */
/* -------------------------------------------------------------------------- */

create or replace function public.is_account_verified(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null and exists (
    select 1 from public.verification_requests
     where user_id = p_user_id and status = 'approved'
  );
$$;

revoke execute on function public.is_account_verified(uuid) from public, anon;
grant execute on function public.is_account_verified(uuid) to authenticated;

alter table public.listings add column verification_grace_until timestamptz;

-- Aucun badge existant ne repose sur une vérification réelle.
update public.listings set is_verified = false;

-- Les annonces déjà en ligne restent visibles 7 jours, y compris celles sans
-- propriétaire, qui ne pourront jamais être vérifiées.
update public.listings
   set verification_grace_until = now() + interval '7 days'
 where status = 'published';

drop policy "listings_public_read" on public.listings;

create policy "listings_public_read"
  on public.listings for select
  using (
    status = 'published'
    and (is_verified or verification_grace_until > now())
  );

-- SECURITY INVOKER : `current_user` est le rôle réel de l'appelant. Le trigger
-- ne contraint que les rôles clients ; `service_role`, les migrations, le seed
-- et les fonctions SECURITY DEFINER (qui s'exécutent sous le rôle
-- propriétaire) passent.
create or replace function public.listings_enforce_verification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_verified := public.is_account_verified(new.owner_id);
    new.verification_grace_until := null;
  else
    new.is_verified := old.is_verified;
    new.verification_grace_until := old.verification_grace_until;
  end if;

  if new.status = 'published' and not new.is_verified then
    -- Seule exception : une annonce déjà en ligne, encore dans son délai.
    if not (
      tg_op = 'UPDATE'
      and old.status = 'published'
      and old.verification_grace_until > now()
    ) then
      raise exception 'verification_required' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger listings_enforce_verification
  before insert or update on public.listings
  for each row execute function public.listings_enforce_verification();

-- `is_verified` n'est plus modifiable à la main : `p_is_verified` est conservé
-- dans la signature pour ne pas casser les appelants, mais ignoré.
create or replace function public.set_listing_certification(
  p_listing_id  uuid,
  p_is_verified boolean,
  p_is_vip      boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.listings
     set is_vip = coalesce(p_is_vip, is_vip)
   where id = p_listing_id;

  if not found then
    raise exception 'listing_not_found' using errcode = '22023';
  end if;
end;
$$;

-- Une annonce masquée (délai écoulé, compte révoqué) ne doit plus recevoir de
-- demande : la fonction contourne RLS et doit donc reprendre la même règle.
create or replace function public.submit_request(
  p_listing_id  uuid,
  p_full_name   text,
  p_phone       text,
  p_email       text,
  p_message     text,
  p_desired_date date,
  p_guests      smallint
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- L'annonce doit exister, être publiée et visible publiquement.
  if not exists (
    select 1 from public.listings
    where id = p_listing_id
      and status = 'published'
      and (is_verified or verification_grace_until > now())
  ) then
    raise exception 'listing_unavailable' using errcode = '22023';
  end if;

  -- Anti-spam : 5 demandes maximum par heure pour un même numéro.
  if (
    select count(*) from public.requests
    where phone = p_phone and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'rate_limited' using errcode = '22023';
  end if;

  insert into public.requests (
    listing_id, full_name, phone, email, message, desired_date, guests, author_id
  ) values (
    p_listing_id, trim(p_full_name), p_phone, nullif(trim(p_email), ''),
    coalesce(p_message, ''), p_desired_date, p_guests, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

/* -------------------------------------------------------------------------- */
/*                         Parcours de vérification                           */
/* -------------------------------------------------------------------------- */

create or replace function public.start_verification()
returns table (id uuid, challenge_code text, code_expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid      uuid := auth.uid();
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  -- `gen_random_uuid` est natif (pas d'extension) et tiré d'une source sûre.
  v_bytes    bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  v_code     text := '';
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (select 1 from public.verification_blocks b where b.user_id = v_uid) then
    raise exception 'blocked' using errcode = 'P0001';
  end if;

  if public.is_account_verified(v_uid) then
    raise exception 'already_verified' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.verification_requests r
     where r.user_id = v_uid and r.status = 'pending'
  ) then
    raise exception 'already_pending' using errcode = 'P0001';
  end if;

  -- Une demande sans vidéo est remplacée ; son éventuel fichier devient
  -- orphelin et sera purgé depuis /admin.
  delete from public.verification_requests r
   where r.user_id = v_uid and r.status = 'awaiting_video';

  for i in 0..5 loop
    v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % length(v_alphabet)), 1);
  end loop;

  return query
    with inserted as (
      insert into public.verification_requests (user_id, challenge_code)
      values (v_uid, v_code)
      returning verification_requests.id,
                verification_requests.challenge_code,
                verification_requests.code_expires_at
    )
    select inserted.id, inserted.challenge_code, inserted.code_expires_at from inserted;
end;
$$;

create or replace function public.submit_verification(
  p_id         uuid,
  p_document   public.verification_document,
  p_video_path text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_request public.verification_requests%rowtype;
begin
  select * into v_request
    from public.verification_requests r
   where r.id = p_id and r.user_id = v_uid and r.status = 'awaiting_video'
   for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_request.code_expires_at < now() then
    raise exception 'code_expired' using errcode = 'P0001';
  end if;

  if p_video_path is null
     or p_video_path !~ ('^' || v_uid::text || '/' || p_id::text || '\.(mp4|mov|webm|3gp)$') then
    raise exception 'invalid_path' using errcode = '22023';
  end if;

  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'verifications' and o.name = p_video_path
  ) then
    raise exception 'video_missing' using errcode = 'P0001';
  end if;

  update public.verification_requests
     set status        = 'pending',
         document_type = p_document,
         video_path    = p_video_path,
         submitted_at  = now()
   where id = p_id;
end;
$$;

-- Renvoie le chemin de la vidéo à supprimer : la suppression du fichier passe
-- par l'API Storage (supprimer la ligne SQL laisserait le fichier en place).
create or replace function public.review_verification(
  p_id       uuid,
  p_decision text,
  p_reason   public.verification_rejection default null,
  p_note     text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.verification_requests%rowtype;
  v_note    text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in ('approve', 'reject', 'block_minor', 'revoke') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  select * into v_request
    from public.verification_requests r
   where r.id = p_id
   for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if (p_decision = 'revoke' and v_request.status <> 'approved')
     or (p_decision <> 'revoke' and v_request.status <> 'pending') then
    raise exception 'already_reviewed' using errcode = 'P0001';
  end if;

  if (p_decision = 'reject' and p_reason is null)
     or (p_decision = 'revoke' and v_note is null) then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  if p_decision = 'reject' and p_reason = 'personne_mineure' then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  if p_decision = 'approve' then
    update public.verification_requests
       set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_id;

    update public.listings
       set is_verified = true, verification_grace_until = null
     where owner_id = v_request.user_id;

  elsif p_decision = 'reject' then
    update public.verification_requests
       set status = 'rejected', rejection_reason = p_reason, rejection_note = v_note,
           reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_id;

  elsif p_decision = 'block_minor' then
    update public.verification_requests
       set status = 'rejected', rejection_reason = 'personne_mineure', rejection_note = v_note,
           reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_id;

    insert into public.verification_blocks (user_id, verification_id, blocked_by)
    values (v_request.user_id, p_id, auth.uid())
    on conflict (user_id) do nothing;

    update public.listings
       set status = 'archived', is_verified = false, verification_grace_until = null
     where owner_id = v_request.user_id;

  else -- revoke
    update public.verification_requests
       set status = 'revoked', rejection_reason = p_reason, rejection_note = v_note,
           reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_id;

    update public.listings
       set is_verified = false
     where owner_id = v_request.user_id;
  end if;

  insert into public.moderation_log (verification_id, moderator_id, action, reason)
  values (p_id, auth.uid(), p_decision, coalesce(v_note, p_reason::text));

  return v_request.video_path;
end;
$$;

create or replace function public.clear_verification_video(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.verification_requests set video_path = null where id = p_id;
end;
$$;

-- PostgreSQL accorde EXECUTE à PUBLIC par défaut : on le retire explicitement.
revoke execute on function public.start_verification() from public, anon;
revoke execute on function public.submit_verification(uuid, public.verification_document, text) from public, anon;
revoke execute on function public.review_verification(uuid, text, public.verification_rejection, text) from public, anon;
revoke execute on function public.clear_verification_video(uuid) from public, anon;

grant execute on function public.start_verification() to authenticated;
grant execute on function public.submit_verification(uuid, public.verification_document, text) to authenticated;
grant execute on function public.review_verification(uuid, text, public.verification_rejection, text) to authenticated;
grant execute on function public.clear_verification_video(uuid) to authenticated;

/* -------------------------------------------------------------------------- */
/*                                  Storage                                   */
/* -------------------------------------------------------------------------- */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verifications', 'verifications', false, 52428800,
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Dépôt dans son propre dossier uniquement. Pas de policy update ni delete :
-- le dépôt est définitif pour le client, la suppression relève de service_role.
create policy "verifications_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'verifications'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Lecture réservée à l'équipe, y compris pour le déposant.
create policy "verifications_admin_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'verifications' and public.is_admin());
```

- [ ] **Step 4 : Adapter la fixture de `security.test.sql`**

L'annonce publiée de la fixture est désormais masquée et non modifiable sans certification. Dans `supabase/tests/security.test.sql`, remplacer le bloc d'insertion des annonces (lignes 31-44) par :

```sql
-- `is_verified = true` : depuis la migration 0010, une annonce publiée n'est
-- visible, modifiable et joignable que si son compte est vérifié. Insérée en
-- superutilisateur, la fixture n'est pas soumise au trigger.
insert into public.listings (
  id, slug, title, description, category, option_type, mobility, city,
  price_xaf, price_unit, cover_url, status, owner_id, is_verified
) values (
  '22222222-2222-2222-2222-222222222222', 'offre-test', 'Offre de test',
  'Description suffisamment longue pour la validation applicative.',
  'categorie-a', 'option_1', 'sur_place', 'brazzaville',
  50000, 'night', 'https://exemple/cover.jpg', 'published',
  '11111111-1111-1111-1111-111111111111', true
), (
  '44444444-4444-4444-4444-444444444444', 'offre-brouillon', 'Offre en brouillon',
  'Description suffisamment longue pour la validation applicative.',
  'categorie-b', 'option_2', 'a_domicile', 'pointe-noire',
  30000, 'service', 'https://exemple/cover2.jpg', 'draft',
  '11111111-1111-1111-1111-111111111111', false
);
```

- [ ] **Step 5 : Mettre le seed en cohérence**

Retirer la mention « Profil vérifié » des descriptions :

```bash
sed -i '' -E "s/E'Profil vérifié à ([^.]+)\. /E'/" supabase/seed.sql
grep -c "Profil vérifié" supabase/seed.sql
```

Expected : `0`.

Puis ajouter à la fin de `supabase/seed.sql` :

```sql

-- Vérification d'identité (migration 0010) --------------------------------
-- Aucune annonce de démonstration n'a fait l'objet d'une vérification : elles
-- ne portent pas le badge et ne restent visibles que pendant un délai de
-- grâce, recalculé à chaque `db reset` pour que la stack locale affiche un
-- catalogue.
update public.listings
   set is_verified = false,
       verification_grace_until = now() + interval '7 days'
 where owner_id is null and status = 'published';
```

- [ ] **Step 6 : Appliquer et vérifier**

```bash
supabase db reset
supabase test db
```

Expected : PASS — `security.test.sql` (34) et `verification.test.sql` (45) entièrement verts.

En cas d'échec de `lives_ok` sur l'insertion dans `storage.objects`, contrôler que le bucket existe (`select id from storage.buckets`) : la migration doit l'avoir créé.

- [ ] **Step 7 : Commit**

```bash
git add supabase/migrations/0010_identity_verification.sql supabase/tests/verification.test.sql supabase/tests/security.test.sql supabase/seed.sql
git commit -m "feat(verification): schéma, règles de publication et bucket privé

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3 : Schéma TypeScript

**Files :**
- Modify : `src/types/database.ts`

**Interfaces :**
- Consumes : types de `@/types/verification` (Task 1), fonctions SQL (Task 2).
- Produces : `VerificationRequestRow`, table `verification_requests`, colonne `ListingRow.verification_grace_until`, RPC `is_account_verified`, `start_verification`, `submit_verification`, `review_verification`, `clear_verification_video`.

- [ ] **Step 1 : Ajouter les imports et le type de ligne**

En tête de `src/types/database.ts`, remplacer `import type { Listing } from "./listing";` par :

```ts
import type { Listing } from "./listing";
import type {
  VerificationDecision,
  VerificationDocument,
  VerificationRejection,
  VerificationStatus,
} from "./verification";
```

Après le type `ReviewRow`, ajouter :

```ts
export type VerificationRequestRow = {
  id: string;
  user_id: string;
  status: VerificationStatus;
  challenge_code: string;
  code_expires_at: string;
  document_type: VerificationDocument | null;
  video_path: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: VerificationRejection | null;
  rejection_note: string | null;
  created_at: string;
};
```

Dans `ListingRow`, après `owner_id: string | null;`, ajouter :

```ts
  /** Fin du délai de grâce d'une annonce publiée avant la vérification obligatoire. */
  verification_grace_until: string | null;
```

- [ ] **Step 2 : Déclarer la table**

Remplacer la déclaration `moderation_log` par :

```ts
      moderation_log: {
        Row: {
          id: string;
          review_id: string | null;
          listing_id: string | null;
          verification_id: string | null;
          action: "remove_review" | VerificationDecision;
          moderator_id: string | null;
          reason: string | null;
          created_at: string;
        };
        // Écrit exclusivement par `moderate_review` et `review_verification`.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      verification_requests: {
        Row: VerificationRequestRow;
        // Écritures réservées aux fonctions `start_verification`,
        // `submit_verification` et `review_verification`.
        Insert: never;
        Update: never;
        Relationships: [];
      };
```

- [ ] **Step 3 : Déclarer les fonctions et enums**

Dans `Functions`, ajouter :

```ts
      is_account_verified: { Args: { p_user_id: string }; Returns: boolean };
      start_verification: {
        Args: Record<string, never>;
        Returns: { id: string; challenge_code: string; code_expires_at: string }[];
      };
      submit_verification: {
        Args: { p_id: string; p_document: VerificationDocument; p_video_path: string };
        Returns: undefined;
      };
      review_verification: {
        Args: {
          p_id: string;
          p_decision: VerificationDecision;
          p_reason?: VerificationRejection | null;
          p_note?: string | null;
        };
        Returns: string | null;
      };
      clear_verification_video: { Args: { p_id: string }; Returns: undefined };
```

Dans `Enums`, ajouter :

```ts
      verification_status: VerificationStatus;
      verification_document: VerificationDocument;
      verification_rejection: VerificationRejection;
```

- [ ] **Step 4 : Vérifier**

Run : `npx tsc --noEmit 2>&1 | grep -v -E "layout.tsx|types/listing.ts|types/index.ts|__mocks__|PrivateGallery|WhatsAppDirectButton|EmergencyDiscretionButton" | head`
Expected : aucune erreur nouvelle par rapport à la ligne de base de la Task 0.

- [ ] **Step 5 : Commit**

```bash
git add src/types/database.ts
git commit -m "feat(verification): typer la table et les fonctions de vérification

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4 : Accès Storage côté serveur et Server Actions partenaire

**Files :**
- Create : `src/lib/verification-storage.ts`
- Create : `src/app/actions/verification.ts`

**Interfaces :**
- Consumes : `createAdminClient` (`@/lib/supabase/admin`), `createClient` (`@/lib/supabase/server`), `VERIFICATION_BUCKET`, `verificationErrorCode`, `verificationErrorMessage`, `VerificationFormState`, `isVerificationDocument`.
- Produces :
  - `findVerificationUpload(userId: string, requestId: string): Promise<string | null>`
  - `listVerificationVideos(): Promise<StoredVideo[]>`
  - `deleteVerificationVideos(paths: string[]): Promise<boolean>`
  - `deleteUserVerificationFiles(userId: string): Promise<boolean>`
  - Action `startVerification(): Promise<void>` (form action ; redirige vers `/partenaire/verification`, avec `?erreur=<code>` en cas d'échec)
  - Action `submitVerification(input: { requestId: string; documentType: string; videoPath: string }): Promise<VerificationFormState>`

- [ ] **Step 1 : Écrire le module Storage**

`src/lib/verification-storage.ts` :

```ts
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { VERIFICATION_BUCKET, type StoredVideo } from "@/lib/verification";

/**
 * Accès au bucket privé `verifications` avec la clé service_role.
 *
 * Aucune policy ne permet au client de relire ou supprimer une vidéo : ces
 * opérations passent donc ici. Les appelants doivent avoir établi le droit
 * d'agir (session du propriétaire, ou `is_admin()`) **avant** d'appeler.
 */
const bucket = () => createAdminClient().storage.from(VERIFICATION_BUCKET);

/** Vidéo déjà déposée pour une demande, quand la soumission n'a pas abouti. */
export async function findVerificationUpload(userId: string, requestId: string): Promise<string | null> {
  const { data, error } = await bucket().list(userId, { limit: 20, search: requestId });

  if (error) {
    console.error("[verification] upload lookup failed", error);
    return null;
  }

  const match = data.find((file) => file.id && file.name.startsWith(`${requestId}.`));
  return match ? `${userId}/${match.name}` : null;
}

/** Toutes les vidéos du bucket, à plat. Les dossiers sont renvoyés sans `id`. */
export async function listVerificationVideos(): Promise<StoredVideo[]> {
  const storage = bucket();
  const { data: folders, error } = await storage.list("", { limit: 1000 });

  if (error) {
    console.error("[verification] bucket listing failed", error);
    return [];
  }

  const nested = await Promise.all(
    folders
      .filter((entry) => !entry.id)
      .map(async (folder) => {
        const { data: files, error: folderError } = await storage.list(folder.name, { limit: 1000 });
        if (folderError) {
          console.error("[verification] folder listing failed", folderError);
          return [];
        }
        return files
          .filter((file) => file.id)
          .map((file) => ({ path: `${folder.name}/${file.name}`, createdAt: file.created_at }));
      }),
  );

  return nested.flat();
}

export async function deleteVerificationVideos(paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;

  const { error } = await bucket().remove(paths);
  if (error) {
    console.error("[verification] video deletion failed", error);
    return false;
  }
  return true;
}

/** Suppression de compte : aucune pièce d'identité ne doit rester orpheline. */
export async function deleteUserVerificationFiles(userId: string): Promise<boolean> {
  const { data, error } = await bucket().list(userId, { limit: 1000 });

  if (error) {
    console.error("[verification] account files listing failed", error);
    return false;
  }

  return deleteVerificationVideos(data.filter((file) => file.id).map((file) => `${userId}/${file.name}`));
}
```

- [ ] **Step 2 : Écrire les Server Actions partenaire**

`src/app/actions/verification.ts` :

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  verificationErrorCode,
  verificationErrorMessage,
  type VerificationFormState,
} from "@/lib/verification";
import { isVerificationDocument } from "@/types/verification";

/**
 * Émet un code de défi. Le code est généré en base : un code choisi par le
 * client permettrait de réutiliser une vidéo tournée à l'avance.
 */
export async function startVerification() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion?suivant=/partenaire/verification");

  const { error } = await supabase.rpc("start_verification");

  if (error) {
    console.error("[verification] start failed", error);
    redirect(`/partenaire/verification?erreur=${verificationErrorCode(error.message) ?? "inconnue"}`);
  }

  revalidatePath("/partenaire/verification");
  redirect("/partenaire/verification");
}

/**
 * Soumission après dépôt du fichier. Le chemin est revérifié ici puis par
 * `submit_verification`, qui contrôle aussi l'existence de l'objet : un
 * client ne peut pas soumettre une vidéo qu'il n'a pas déposée.
 */
export async function submitVerification(input: {
  requestId: string;
  documentType: string;
  videoPath: string;
}): Promise<VerificationFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "error", message: "Votre session a expiré. Reconnectez-vous." };

  if (!isVerificationDocument(input.documentType)) {
    return { status: "error", message: "Choisissez le type de pièce d'identité." };
  }
  if (!input.videoPath.startsWith(`${user.id}/${input.requestId}.`)) {
    return { status: "error", message: verificationErrorMessage("invalid_path") };
  }

  const { error } = await supabase.rpc("submit_verification", {
    p_id: input.requestId,
    p_document: input.documentType,
    p_video_path: input.videoPath,
  });

  if (error) {
    console.error("[verification] submit failed", error);
    return { status: "error", message: verificationErrorMessage(error.message) };
  }

  revalidatePath("/partenaire");
  revalidatePath("/partenaire/verification");
  return { status: "success", message: null };
}
```

- [ ] **Step 3 : Vérifier**

Run : `npx tsc --noEmit 2>&1 | grep -E "verification" | head`
Expected : aucune sortie.

- [ ] **Step 4 : Commit**

```bash
git add src/lib/verification-storage.ts src/app/actions/verification.ts
git commit -m "feat(verification): actions partenaire et accès Storage serveur

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5 : Page de vérification et envoi de la vidéo

**Files :**
- Create : `src/components/verification/VerificationUpload.tsx`
- Create : `src/app/partenaire/verification/page.tsx`

**Interfaces :**
- Consumes : `startVerification`, `submitVerification` (Task 4), `findVerificationUpload` (Task 4), `checkVideo`, `verificationVideoPath`, `verificationView`, `verificationErrorMessage` (appliqué au paramètre d'URL `erreur`), `VERIFICATION_BUCKET`, `VERIFICATION_DOCUMENTS`, `rejectionReason`.
- Produces : composant `VerificationUpload({ userId, requestId, uploadedPath }: { userId: string; requestId: string; uploadedPath: string | null })` ; route `/partenaire/verification` exposant `data-testid="challenge-code"`, le bouton « Commencer », « Envoyer la vidéo » / « Finaliser l'envoi », et les textes « Vérification en cours d'examen », « Identité vérifiée ».

- [ ] **Step 1 : Écrire le composant d'envoi**

`src/components/verification/VerificationUpload.tsx` :

```tsx
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
```

- [ ] **Step 2 : Écrire la page**

`src/app/partenaire/verification/page.tsx` :

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck, Clock, ShieldCheck, ShieldX } from "lucide-react";

import { startVerification } from "@/app/actions/verification";
import { VerificationUpload } from "@/components/verification/VerificationUpload";
import { createClient } from "@/lib/supabase/server";
import { verificationErrorMessage, verificationView, type LatestVerification } from "@/lib/verification";
import { findVerificationUpload } from "@/lib/verification-storage";
import { rejectionReason } from "@/types/verification";
import type { RawSearchParams } from "@/lib/filters";

export const dynamic = "force-dynamic";

export const metadata = { title: "Vérification d'identité" };

type Latest = LatestVerification & {
  id: string;
  challenge_code: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_note: string | null;
};

const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export default async function VerificationPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion?suivant=/partenaire/verification");

  // Filtre `user_id` explicite : un administrateur lit toutes les demandes
  // (policies combinées en OU), il ne doit voir ici que la sienne.
  const { data: latest } = await supabase
    .from("verification_requests")
    .select("id, status, challenge_code, code_expires_at, submitted_at, reviewed_at, rejection_reason, rejection_note")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Latest>();

  const view = verificationView(latest ?? null, new Date());
  const erreur = typeof params.erreur === "string" ? verificationErrorMessage(params.erreur) : null;
  const uploadedPath =
    view === "upload" && latest ? await findVerificationUpload(user.id, latest.id) : null;
  const reason = latest?.rejection_reason ? rejectionReason(latest.rejection_reason) : null;

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <Link
        href="/partenaire"
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-slate-300 transition hover:bg-white/[0.09] hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Tableau de bord
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Vérification d&apos;identité</h1>
        <p className="text-sm leading-relaxed text-slate-400">
          Obligatoire pour publier un profil. Elle garantit que chaque profil appartient à une
          personne majeure, réelle, qui correspond à ses photos.
        </p>
      </header>

      {erreur && (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {erreur}
        </p>
      )}

      {(view === "start" || view === "rejected" || view === "revoked") && (
        <section className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          {view === "rejected" && reason && (
            <div role="status" className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <p className="font-medium">Votre précédente vidéo n&apos;a pas pu être validée : {reason.label.toLowerCase()}.</p>
              <p className="mt-1 text-amber-200/80">{reason.partner}</p>
              {latest?.rejection_note && <p className="mt-1 text-amber-200/80">{latest.rejection_note}</p>}
            </div>
          )}
          {view === "revoked" && (
            <div role="status" className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <p className="font-medium">Votre vérification a été retirée.</p>
              {latest?.rejection_note && <p className="mt-1 text-amber-200/80">{latest.rejection_note}</p>}
            </div>
          )}

          <ul className="space-y-2 text-sm text-slate-300">
            <li>• Une vidéo de 15 secondes, visage et pièce d&apos;identité visibles.</li>
            <li>• Elle est examinée par une personne de l&apos;équipe Matripa, jamais publiée.</li>
            <li>• Elle est <strong className="text-white">supprimée dès la décision</strong>.</li>
            <li>• Nous ne conservons ni le numéro de votre pièce ni votre date de naissance.</li>
          </ul>

          <form action={startVerification}>
            <button
              type="submit"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-action text-sm font-semibold text-slate-950 transition hover:brightness-110"
            >
              <ShieldCheck className="size-4" aria-hidden />
              {view === "start" ? "Commencer" : "Recommencer"}
            </button>
          </form>
        </section>
      )}

      {view === "upload" && latest && (
        <section className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="space-y-2 text-center">
            <p className="text-xs uppercase tracking-widest text-slate-500">Votre code</p>
            <p data-testid="challenge-code" className="font-mono text-4xl font-semibold tracking-[0.3em] text-white">
              {latest.challenge_code}
            </p>
            <p className="text-xs text-slate-500">
              Valable jusqu&apos;à{" "}
              {new Date(latest.code_expires_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>

          <ol className="space-y-2 text-sm text-slate-300">
            <li>1. Filmez-vous de face, dans un endroit bien éclairé.</li>
            <li>2. Tenez votre pièce d&apos;identité à côté de votre visage, date de naissance lisible.</li>
            <li>3. Prononcez distinctement le code affiché.</li>
            <li>4. 15 secondes suffisent.</li>
          </ol>

          <VerificationUpload userId={user.id} requestId={latest.id} uploadedPath={uploadedPath} />
        </section>
      )}

      {view === "expired" && (
        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm text-slate-300">
            Ce code a expiré. Une vidéo doit porter un code récent : demandez-en un nouveau, puis
            filmez à nouveau.
          </p>
          <form action={startVerification}>
            <button
              type="submit"
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-action text-sm font-semibold text-slate-950 transition hover:brightness-110"
            >
              Obtenir un nouveau code
            </button>
          </form>
        </section>
      )}

      {view === "pending" && latest?.submitted_at && (
        <section role="status" className="flex items-start gap-3 rounded-2xl border border-sky-400/30 bg-sky-500/10 p-5 text-sm text-sky-100">
          <Clock className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Vérification en cours d&apos;examen</p>
            <p className="mt-1 text-sky-200/80">Vidéo envoyée le {dateFr(latest.submitted_at)}.</p>
          </div>
        </section>
      )}

      {view === "approved" && latest?.reviewed_at && (
        <section role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-sm text-emerald-100">
          <BadgeCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Identité vérifiée</p>
            <p className="mt-1 text-emerald-200/80">
              Validée le {dateFr(latest.reviewed_at)}. Vos profils portent le badge « Certifié ».
            </p>
          </div>
        </section>
      )}

      {view === "blocked" && (
        <section role="status" className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-300">
          <ShieldX className="mt-0.5 size-5 shrink-0 text-slate-400" aria-hidden />
          <p>La vérification n&apos;est pas disponible pour ce compte. Contactez le support.</p>
        </section>
      )}
    </div>
  );
}
```

Note : `verificationErrorMessage` reçoit le paramètre d'URL brut ; un code inconnu donne le message de repli, sans jamais afficher le texte fourni dans l'URL.

- [ ] **Step 3 : Vérifier manuellement**

```bash
npm run dev
```

Dans un navigateur : créer un compte sur `/connexion`, ouvrir `http://localhost:3000/partenaire/verification`, cliquer « Commencer ». Expected : code à 6 caractères affiché, sélecteur de pièce, zone « Filmer ma vidéo ». Choisir une courte vidéo MP4 locale, cliquer « Envoyer la vidéo ». Expected : page rafraîchie sur « Vérification en cours d'examen ».

(Nécessite `.env.local` pointé sur la stack locale.)

- [ ] **Step 4 : Vérifier les types**

Run : `npx tsc --noEmit 2>&1 | grep -E "verification" | head`
Expected : aucune sortie.

- [ ] **Step 5 : Commit**

```bash
git add src/components/verification/VerificationUpload.tsx src/app/partenaire/verification/page.tsx
git commit -m "feat(verification): parcours partenaire d'envoi du selfie vidéo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6 : Publication conditionnelle dans l'espace partenaire

**Files :**
- Create : `src/components/verification/VerificationBanner.tsx`
- Modify : `src/app/partenaire/page.tsx`
- Modify : `src/components/partner/ListingForm.tsx`
- Modify : `src/app/partenaire/annonces/nouvelle/page.tsx`
- Modify : `src/app/partenaire/annonces/[id]/modifier/page.tsx`
- Modify : `src/app/actions/listings.ts`

**Interfaces :**
- Consumes : RPC `is_account_verified` (Task 3), `graceSummary`, `verificationErrorCode`, `verificationErrorMessage` (Task 1).
- Produces : `VerificationBanner({ pending, grace }: { pending: boolean; grace: { deadline: Date; count: number } | null })` ; prop `canPublish: boolean` sur `ListingForm` ; bouton de création libellé « Enregistrer le brouillon » quand `canPublish` est faux ; redirection `/partenaire?erreur=verification`.

- [ ] **Step 1 : Écrire le bandeau**

`src/components/verification/VerificationBanner.tsx` :

```tsx
import Link from "next/link";
import { ArrowRight, Clock, ShieldAlert } from "lucide-react";

const dateFr = (date: Date) =>
  date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

/** Affiché sur le tableau de bord tant que le compte n'est pas vérifié. */
export function VerificationBanner({
  pending,
  grace,
}: {
  pending: boolean;
  grace: { deadline: Date; count: number } | null;
}) {
  const Icon = pending ? Clock : ShieldAlert;

  const message = pending
    ? "Vérification en cours d'examen."
    : grace
      ? `Vos ${grace.count} profil${grace.count > 1 ? "s" : ""} en ligne ser${grace.count > 1 ? "ont" : "a"} masqué${grace.count > 1 ? "s" : ""} le ${dateFr(grace.deadline)} sans vérification d'identité.`
      : "Vérifiez votre identité pour publier.";

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">{message}</p>
      <Link
        href="/partenaire/verification"
        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-300/40 px-3 text-xs font-medium text-amber-50 transition hover:bg-amber-500/20"
      >
        {pending ? "Voir le suivi" : "Vérifier mon identité"}
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
```

- [ ] **Step 2 : Intégrer au tableau de bord**

Dans `src/app/partenaire/page.tsx` :

1. Ajouter aux imports :

```tsx
import { VerificationBanner } from "@/components/verification/VerificationBanner";
import { graceSummary } from "@/lib/verification";
```

2. Dans `OwnListing`, ajouter `verification_grace_until: string | null;`.

3. Remplacer la ligne `const notice = …` par :

```tsx
  const notice = params.cree === "1" ? "Profil enregistré." : params.modifie === "1" ? "Modifications enregistrées." : null;
  const verificationError = params.erreur === "verification";
```

4. Remplacer le `Promise.all` par :

```tsx
  const [{ data: listings }, { data: requests }, { data: verified }, { data: latestVerification }] =
    await Promise.all([
      supabase
        .from("listings")
        .select("id, slug, title, city, price_xaf, price_unit, cover_url, status, is_vip, is_verified, verification_grace_until")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .returns<OwnListing[]>(),
      supabase
        .from("requests")
        .select("id, full_name, phone, message, created_at, status, listing_id")
        .order("created_at", { ascending: false })
        .limit(20)
        .returns<OwnRequest[]>(),
      supabase.rpc("is_account_verified", { p_user_id: user.id }),
      supabase
        .from("verification_requests")
        .select("status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ status: string }>(),
    ]);
```

5. Après `const titleById = …`, ajouter :

```tsx
  const now = new Date();
  const isVerified = verified === true;
  const grace = graceSummary(mine, now);
```

6. Juste après le bloc `{notice && (…)}`, ajouter :

```tsx
      {verificationError && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          Vérifiez votre identité avant de publier un profil.
        </p>
      )}

      {!isVerified && (
        <VerificationBanner pending={latestVerification?.status === "pending"} grace={grace} />
      )}
```

7. Remplacer le bloc des actions de statut :

```tsx
                  {listing.status === "published" ? (
                    <StatusAction id={listing.id} to="draft" icon="down" label="Dépublier" />
                  ) : (
                    <StatusAction id={listing.id} to="published" icon="up" label="Publier" />
                  )}
```

par :

```tsx
                  {listing.status === "published" ? (
                    <StatusAction id={listing.id} to="draft" icon="down" label="Dépublier" />
                  ) : isVerified ? (
                    <StatusAction id={listing.id} to="published" icon="up" label="Publier" />
                  ) : (
                    <Link
                      href="/partenaire/verification"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-amber-300 transition hover:bg-white/[0.08]"
                    >
                      Vérifier pour publier
                    </Link>
                  )}
```

- [ ] **Step 3 : Rendre la publication conditionnelle dans le formulaire**

Dans `src/components/partner/ListingForm.tsx` :

1. Ajouter `import Link from "next/link";` après `import Image from "next/image";`.

2. Remplacer la signature :

```tsx
export function ListingForm({
  userId,
  listing,
}: {
  userId: string;
  listing?: EditableListing;
}) {
```

par :

```tsx
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
```

3. Remplacer le bloc `<label …>` contenant `name="publish"` jusqu'à `<SubmitButton … />` inclus par :

```tsx
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
```

4. Dans `SubmitButton`, remplacer la signature `function SubmitButton({ disabled, isEdit }: { disabled: boolean; isEdit: boolean }) {` par :

```tsx
function SubmitButton({
  disabled,
  isEdit,
  canPublish,
}: {
  disabled: boolean;
  isEdit: boolean;
  canPublish: boolean;
}) {
```

et la ligne `{isEdit ? "Enregistrer les modifications" : "Publier le profil"}` par :

```tsx
      {isEdit ? "Enregistrer les modifications" : canPublish ? "Publier le profil" : "Enregistrer le brouillon"}
```

- [ ] **Step 4 : Transmettre `canPublish` depuis les pages**

Dans `src/app/partenaire/annonces/nouvelle/page.tsx`, après le `redirect` :

```tsx
  const { data: verified } = await supabase.rpc("is_account_verified", { p_user_id: user.id });
```

Remplacer le paragraphe d'introduction par :

```tsx
      <p className="mb-8 mt-1.5 text-sm leading-relaxed text-slate-400">
        Les champs marqués d&apos;un astérisque sont obligatoires. Le badge « Certifié » est
        attribué automatiquement une fois votre identité vérifiée ; la mise en avant VIP relève
        de l&apos;équipe Matripa.
      </p>
```

et `<ListingForm userId={user.id} />` par `<ListingForm userId={user.id} canPublish={verified === true} />`.

Dans `src/app/partenaire/annonces/[id]/modifier/page.tsx` :

1. Ajouter `verification_grace_until` à la fin de la chaîne de projection (après `status`) et remplacer `.maybeSingle<EditableListing>()` par `.maybeSingle<EditableListing & { verification_grace_until: string | null }>()`.

2. Après `if (!listing) notFound();`, ajouter :

```tsx
  const { data: verified } = await supabase.rpc("is_account_verified", { p_user_id: user.id });
  const inGrace =
    listing.status === "published" &&
    listing.verification_grace_until !== null &&
    new Date(listing.verification_grace_until) > new Date();
```

3. Remplacer `<ListingForm userId={user.id} listing={listing} />` par `<ListingForm userId={user.id} listing={listing} canPublish={verified === true || inGrace} />`.

- [ ] **Step 5 : Traduire le refus de publication côté actions**

Dans `src/app/actions/listings.ts` :

1. Ajouter aux imports : `import { verificationErrorCode, verificationErrorMessage } from "@/lib/verification";`

2. Dans `createListing` **et** dans `updateListing`, remplacer :

```ts
  if (error) {
    console.error("[listings] create failed", error);
```

(resp. `"[listings] update failed"`) par le même bloc précédé d'un test dédié :

```ts
  if (error && verificationErrorCode(error.message) === "verification_required") {
    return { status: "error", message: verificationErrorMessage(error.message), errors: {} };
  }
  if (error) {
    console.error("[listings] create failed", error);
```

(conserver `"[listings] update failed"` dans `updateListing`).

3. Dans `setListingStatus`, remplacer :

```ts
  if (error) console.error("[listings] status update failed", error);
```

par :

```ts
  if (error) {
    console.error("[listings] status update failed", error);
    if (verificationErrorCode(error.message) === "verification_required") {
      redirect("/partenaire?erreur=verification");
    }
  }
```

- [ ] **Step 6 : Vérifier**

Run : `npx tsc --noEmit 2>&1 | grep -v -E "layout.tsx|types/listing.ts|types/index.ts|__mocks__|PrivateGallery|WhatsAppDirectButton|EmergencyDiscretionButton" | head` puis `npx vitest run`
Expected : aucune erreur de type nouvelle ; tous les tests Vitest verts.

Vérification manuelle (`npm run dev`) : un compte non vérifié voit le bandeau sur `/partenaire`, et sur « Nouveau profil » la case « Publier » est désactivée et le bouton indique « Enregistrer le brouillon ».

- [ ] **Step 7 : Commit**

```bash
git add src/components/verification/VerificationBanner.tsx src/app/partenaire/page.tsx src/components/partner/ListingForm.tsx src/app/partenaire/annonces/nouvelle/page.tsx "src/app/partenaire/annonces/[id]/modifier/page.tsx" src/app/actions/listings.ts
git commit -m "feat(verification): publication conditionnée à la vérification du compte

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7 : Examen par l'administrateur

**Files :**
- Modify : `src/app/actions/admin.ts`
- Create : `src/components/verification/VerificationReview.tsx`
- Create : `src/components/verification/AdminVerificationSection.tsx`
- Modify : `src/app/admin/page.tsx`

**Interfaces :**
- Consumes : RPC `review_verification`, `clear_verification_video`, `is_admin` ; `listVerificationVideos`, `deleteVerificationVideos` (Task 4) ; `planVideoPurge`, `hasAllApprovalChecks`, `APPROVAL_CHECKS`, `verificationErrorMessage`, `INITIAL_VERIFICATION_STATE`, `VERIFICATION_BUCKET` (Task 1) ; `ADMIN_REJECT_OPTIONS`, `documentLabel`, `isRejectionReason`, `isVerificationDecision`.
- Produces :
  - `reviewVerification(prev: VerificationFormState, formData: FormData): Promise<VerificationFormState>` — champs `request_id`, `decision` (bouton soumetteur), `reason`, `note`, `check_face`, `check_document`, `check_age`, `check_code`.
  - `revokeVerification(formData: FormData): Promise<void>`
  - `getVerificationVideoUrl(requestId: string): Promise<string | null>`
  - `purgeVerificationVideos(formData: FormData): Promise<void>`
  - `VerificationReview({ requestId }: { requestId: string })`
  - `AdminVerificationSection({ page }: { page: number })` — boutons « Voir la vidéo », « Approuver », « Rejeter », « Signaler une personne mineure », « Confirmer le signalement », « Révoquer », « Purger ».

- [ ] **Step 1 : Ajouter les actions d'administration**

Dans `src/app/actions/admin.ts`, remplacer le bloc d'imports par :

```ts
"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { LISTINGS_TAG } from "@/lib/listings";
import {
  hasAllApprovalChecks,
  planVideoPurge,
  verificationErrorMessage,
  VERIFICATION_BUCKET,
  type VerificationFormState,
  type VideoReference,
} from "@/lib/verification";
import { deleteVerificationVideos, listVerificationVideos } from "@/lib/verification-storage";
import { isRejectionReason, isVerificationDecision } from "@/types/verification";
```

Remplacer `setCertification` par :

```ts
/**
 * Mise en avant VIP d'une annonce.
 *
 * Le badge « Certifié » n'est plus modifiable ici : il découle de la
 * vérification d'identité du compte (migration 0010).
 */
export async function setCertification(formData: FormData) {
  const listingId = formData.get("listing_id");
  const field = formData.get("field");
  const value = formData.get("value") === "true";

  if (typeof listingId !== "string" || field !== "is_vip") return;

  const supabase = await createClient();

  const { error } = await supabase.rpc("set_listing_certification", {
    p_listing_id: listingId,
    p_is_verified: null,
    p_is_vip: value,
  });

  if (error) console.error("[admin] certification failed", error);

  revalidatePath("/admin");
  revalidateTag(LISTINGS_TAG);
}
```

Ajouter à la fin du fichier :

```ts
/**
 * Décision sur une vérification, puis suppression immédiate de la vidéo.
 *
 * La décision est écrite d'abord, en une transaction. Si la suppression du
 * fichier échoue ensuite, elle reste acquise : `video_path` n'est pas remis à
 * null et la vidéo apparaît dans la file de purge.
 */
async function decide(formData: FormData): Promise<VerificationFormState> {
  const requestId = formData.get("request_id");
  const decision = formData.get("decision");
  const reason = formData.get("reason");
  const note = formData.get("note");

  if (typeof requestId !== "string" || !requestId || !isVerificationDecision(decision)) {
    return { status: "error", message: "Décision invalide." };
  }
  if (decision === "approve" && !hasAllApprovalChecks(formData)) {
    return { status: "error", message: "Cochez les quatre contrôles avant d'approuver." };
  }

  const supabase = await createClient();

  const { data: videoPath, error } = await supabase.rpc("review_verification", {
    p_id: requestId,
    p_decision: decision,
    p_reason: decision === "reject" && isRejectionReason(reason) ? reason : null,
    p_note: typeof note === "string" && note.trim() ? note.trim().slice(0, 300) : null,
  });

  if (error) {
    console.error("[admin] verification review failed", error);
    revalidatePath("/admin");
    return { status: "error", message: verificationErrorMessage(error.message) };
  }

  if (videoPath && (await deleteVerificationVideos([videoPath]))) {
    const { error: clearError } = await supabase.rpc("clear_verification_video", { p_id: requestId });
    if (clearError) console.error("[admin] clearing video path failed", clearError);
  }

  revalidatePath("/admin");
  revalidateTag(LISTINGS_TAG);
  return { status: "success", message: null };
}

export async function reviewVerification(
  _prev: VerificationFormState,
  formData: FormData,
): Promise<VerificationFormState> {
  return decide(formData);
}

/** Révocation depuis la liste des comptes vérifiés (formulaire sans JavaScript). */
export async function revokeVerification(formData: FormData) {
  formData.set("decision", "revoke");
  await decide(formData);
}

/**
 * URL signée de 5 minutes, générée au clic : le lien ne figure jamais dans le
 * HTML et une page laissée ouverte n'expose rien. Le client de session suffit,
 * la policy `verifications_admin_read` autorisant la lecture à l'équipe.
 */
export async function getVerificationVideoUrl(requestId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return null;

  const { data } = await supabase
    .from("verification_requests")
    .select("video_path")
    .eq("id", requestId)
    .maybeSingle<{ video_path: string | null }>();

  if (!data?.video_path) return null;

  const { data: signed, error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .createSignedUrl(data.video_path, 300);

  if (error) {
    console.error("[admin] signed url failed", error);
    return null;
  }
  return signed.signedUrl;
}

/** Supprime les vidéos jugées ou abandonnées que la décision n'a pas pu effacer. */
export async function purgeVerificationVideos(_formData: FormData) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return;

  const [{ data: refs }, files] = await Promise.all([
    supabase
      .from("verification_requests")
      .select("id, status, video_path")
      .not("video_path", "is", null)
      .returns<VideoReference[]>(),
    listVerificationVideos(),
  ]);

  const plan = planVideoPurge(files, refs ?? [], new Date());

  if (await deleteVerificationVideos(plan.paths)) {
    for (const id of plan.clearRequestIds) {
      const { error } = await supabase.rpc("clear_verification_video", { p_id: id });
      if (error) console.error("[admin] clearing video path failed", error);
    }
  }

  revalidatePath("/admin");
}
```

- [ ] **Step 2 : Écrire le composant de décision**

`src/components/verification/VerificationReview.tsx` :

```tsx
"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Check, Eye, Loader2, ShieldX, X } from "lucide-react";

import { getVerificationVideoUrl, reviewVerification } from "@/app/actions/admin";
import { APPROVAL_CHECKS, INITIAL_VERIFICATION_STATE } from "@/lib/verification";
import { ADMIN_REJECT_OPTIONS } from "@/types/verification";

/** Lecteur monté seulement au clic, sur une URL signée de 5 minutes. */
function VerificationVideo({ requestId }: { requestId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load() {
    setLoading(true);
    setFailed(false);
    const signed = await getVerificationVideoUrl(requestId);
    setLoading(false);
    if (signed) setUrl(signed);
    else setFailed(true);
  }

  if (url) {
    return <video src={url} controls playsInline className="aspect-[9/16] max-h-96 w-full rounded-xl bg-black object-contain" />;
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm text-white transition hover:bg-white/[0.08] disabled:opacity-50"
      >
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        Voir la vidéo
      </button>
      {failed && <p className="text-xs text-red-300">Vidéo indisponible. Rechargez la page.</p>}
    </div>
  );
}

export function VerificationReview({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(reviewVerification, INITIAL_VERIFICATION_STATE);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [confirmMinor, setConfirmMinor] = useState(false);

  const allChecked = APPROVAL_CHECKS.every(({ name }) => checked[name]);

  return (
    <div className="space-y-4">
      <VerificationVideo requestId={requestId} />

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="request_id" value={requestId} />

        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Contrôles</legend>
          {APPROVAL_CHECKS.map(({ name, label }) => (
            <label key={name} className="flex items-center gap-2.5 text-sm text-slate-300">
              <input
                type="checkbox"
                name={name}
                checked={Boolean(checked[name])}
                onChange={(event) => setChecked((prev) => ({ ...prev, [name]: event.target.checked }))}
                className="size-4 accent-emerald-400"
              />
              {label}
            </label>
          ))}
        </fieldset>

        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={!allChecked || pending}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Check className="size-4" aria-hidden />
          Approuver
        </button>

        <div className="flex flex-wrap gap-2 border-t border-white/[0.07] pt-4">
          <label htmlFor={`reason-${requestId}`} className="sr-only">
            Motif du rejet
          </label>
          <select
            id={`reason-${requestId}`}
            name="reason"
            defaultValue=""
            className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white"
          >
            <option value="" disabled className="bg-slate-900">
              Motif du rejet
            </option>
            {ADMIN_REJECT_OPTIONS.map((option) => (
              <option key={option.slug} value={option.slug} className="bg-slate-900">
                {option.label}
              </option>
            ))}
          </select>
          <label htmlFor={`note-${requestId}`} className="sr-only">
            Complément
          </label>
          <input
            id={`note-${requestId}`}
            name="note"
            type="text"
            maxLength={300}
            placeholder="Complément (facultatif)"
            className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-slate-600"
          />
          <button
            type="submit"
            name="decision"
            value="reject"
            disabled={pending}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-rose-400/30 px-4 text-sm font-medium text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50"
          >
            <X className="size-4" aria-hidden />
            Rejeter
          </button>
        </div>

        <div className="border-t border-white/[0.07] pt-4">
          {confirmMinor ? (
            <div className="space-y-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
              <p className="text-sm text-red-100">
                Toutes les annonces du compte seront archivées et le compte ne pourra plus demander
                de vérification.
              </p>
              <div className="flex gap-2">
                <button
                  type="submit"
                  name="decision"
                  value="block_minor"
                  disabled={pending}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-500 px-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Confirmer le signalement
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmMinor(false)}
                  className="inline-flex h-9 items-center rounded-lg px-3 text-sm text-slate-300 hover:bg-white/[0.06]"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmMinor(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-red-300 transition hover:bg-red-500/10"
            >
              <ShieldX className="size-4" aria-hidden />
              Signaler une personne mineure
            </button>
          )}
        </div>

        {state.status === "error" && state.message && (
          <p role="alert" className="flex items-start gap-2 text-sm text-red-300">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {state.message}
          </p>
        )}
      </form>
    </div>
  );
}
```

- [ ] **Step 3 : Écrire la section d'administration**

`src/components/verification/AdminVerificationSection.tsx` :

```tsx
import Image from "next/image";
import Link from "next/link";
import { Trash2, UserCheck } from "lucide-react";

import { purgeVerificationVideos, revokeVerification } from "@/app/actions/admin";
import { VerificationReview } from "@/components/verification/VerificationReview";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { planVideoPurge, type VideoReference } from "@/lib/verification";
import { listVerificationVideos } from "@/lib/verification-storage";
import { documentLabel } from "@/types/verification";

const PAGE_SIZE = 20;

type QueueItem = {
  id: string;
  user_id: string;
  document_type: string | null;
  submitted_at: string;
  challenge_code: string;
};

type VerifiedItem = { id: string; user_id: string; reviewed_at: string };

const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Précondition : l'appelant a vérifié `is_admin()`. Les adresses e-mail ne
 * sont lisibles qu'avec service_role ; elles ne quittent pas le serveur.
 */
export async function AdminVerificationSection({ page }: { page: number }) {
  const supabase = await createClient();
  const from = (page - 1) * PAGE_SIZE;

  const [{ data: queueData }, { data: verifiedData, count }, { data: refs }, files] = await Promise.all([
    supabase
      .from("verification_requests")
      .select("id, user_id, document_type, submitted_at, challenge_code")
      .eq("status", "pending")
      .order("submitted_at", { ascending: true })
      .returns<QueueItem[]>(),
    supabase
      .from("verification_requests")
      .select("id, user_id, reviewed_at", { count: "exact" })
      .eq("status", "approved")
      .order("reviewed_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
      .returns<VerifiedItem[]>(),
    supabase
      .from("verification_requests")
      .select("id, status, video_path")
      .not("video_path", "is", null)
      .returns<VideoReference[]>(),
    listVerificationVideos(),
  ]);

  const queue = queueData ?? [];
  const verifiedAccounts = verifiedData ?? [];
  const purge = planVideoPurge(files, refs ?? [], new Date());
  const toPurge = purge.paths.length;

  const userIds = [...new Set([...queue, ...verifiedAccounts].map((item) => item.user_id))];
  const admin = createAdminClient();
  const emails = new Map(
    await Promise.all(
      userIds.map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id);
        return [id, data.user?.email ?? "Compte supprimé"] as const;
      }),
    ),
  );

  const { data: covers } = queue.length
    ? await supabase
        .from("listings")
        .select("owner_id, cover_url")
        .in("owner_id", queue.map((item) => item.user_id))
        .returns<{ owner_id: string; cover_url: string }[]>()
    : { data: [] as { owner_id: string; cover_url: string }[] };

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <section className="mb-14 space-y-10">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-white">Vérifications d&apos;identité</h2>
        <p className="mb-5 mt-1.5 text-sm leading-relaxed text-slate-400">
          {queue.length} demande{queue.length > 1 ? "s" : ""} en attente. La vidéo est supprimée dès la décision.
        </p>

        {toPurge > 0 && (
          <form
            action={purgeVerificationVideos}
            className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          >
            <p className="flex-1">
              {toPurge} vidéo{toPurge > 1 ? "s" : ""} à purger (déjà jugée{toPurge > 1 ? "s" : ""} ou abandonnée{toPurge > 1 ? "s" : ""}).
            </p>
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-300/40 px-3 text-xs font-medium hover:bg-amber-500/20"
            >
              <Trash2 className="size-3.5" aria-hidden />
              Purger
            </button>
          </form>
        )}

        {queue.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-slate-400">
            Aucune vérification en attente.
          </p>
        ) : (
          <ul className="space-y-4">
            {queue.map((item) => (
              <li key={item.id} className="grid gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-sm font-medium text-white">{emails.get(item.user_id)}</p>
                  <p className="text-xs text-slate-400">
                    Envoyée le {dateFr(item.submitted_at)} · {documentLabel(item.document_type ?? "")}
                  </p>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-slate-500">Code attendu</p>
                    <p className="font-mono text-3xl font-semibold tracking-[0.3em] text-white">{item.challenge_code}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(covers ?? [])
                      .filter((cover) => cover.owner_id === item.user_id)
                      .map((cover) => (
                        <div key={cover.cover_url} className="relative size-16 overflow-hidden rounded-lg">
                          <Image src={cover.cover_url} alt="" fill sizes="64px" className="object-cover" />
                        </div>
                      ))}
                  </div>
                </div>
                <VerificationReview requestId={item.id} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-xl font-semibold tracking-tight text-white">Comptes vérifiés</h2>
        <p className="mb-5 mt-1.5 text-sm leading-relaxed text-slate-400">
          La révocation retire le badge et masque immédiatement les profils du compte.
        </p>

        {verifiedAccounts.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-slate-400">
            Aucun compte vérifié.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            {verifiedAccounts.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 p-4">
                <UserCheck className="size-4 shrink-0 text-emerald-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{emails.get(item.user_id)}</p>
                  <p className="text-xs text-slate-500">Vérifié le {dateFr(item.reviewed_at)}</p>
                </div>
                <form action={revokeVerification} className="flex flex-wrap gap-2">
                  <input type="hidden" name="request_id" value={item.id} />
                  <label htmlFor={`revoke-${item.id}`} className="sr-only">
                    Motif de la révocation
                  </label>
                  <input
                    id={`revoke-${item.id}`}
                    name="note"
                    required
                    maxLength={300}
                    placeholder="Motif (obligatoire)"
                    className="h-9 w-48 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-white placeholder:text-slate-600"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center rounded-lg border border-rose-400/30 px-3 text-xs font-medium text-rose-300 hover:bg-rose-500/10"
                  >
                    Révoquer
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <nav aria-label="Pagination des comptes vérifiés" className="mt-4 flex items-center gap-3 text-sm text-slate-400">
            {page > 1 && <Link href={`/admin?verifies=${page - 1}`} className="hover:text-white">Précédents</Link>}
            <span>
              Page {page} / {totalPages}
            </span>
            {page < totalPages && <Link href={`/admin?verifies=${page + 1}`} className="hover:text-white">Suivants</Link>}
          </nav>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4 : Intégrer à `/admin` et retirer la bascule « Vérifié »**

Dans `src/app/admin/page.tsx` :

1. Imports : remplacer `import { BadgeCheck, Crown, MapPin, ShieldCheck , Trash2 } from "lucide-react";` par `import { Crown, MapPin, ShieldCheck, Trash2 } from "lucide-react";` et ajouter :

```tsx
import { AdminVerificationSection } from "@/components/verification/AdminVerificationSection";
import type { RawSearchParams } from "@/lib/filters";
```

2. Remplacer `export default async function AdminPage() {` par :

```tsx
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const verifiedPage = Math.max(1, Number.parseInt(typeof params.verifies === "string" ? params.verifies : "1", 10) || 1);
```

3. Supprimer la ligne `const pending = listings.filter((l) => !l.is_verified).length;`.

4. Remplacer le `<h1>` et le paragraphe qui le suit par :

```tsx
          <h1 className="text-2xl font-semibold tracking-tight text-white">Administration</h1>
          <p className="text-sm leading-relaxed text-slate-400">
            {listings.length} profil{listings.length > 1 ? "s" : ""} au catalogue. Le badge
            « Certifié » découle de la vérification d&apos;identité du compte.
          </p>
        </header>

        <AdminVerificationSection page={verifiedPage} />

        <h2 className="mb-5 text-xl font-semibold tracking-tight text-white">Mise en avant VIP</h2>
```

(le `</header>` d'origine est remplacé par celui-ci ; ne pas le dupliquer).

5. Dans la liste des annonces, remplacer les deux `<Toggle …/>` par :

```tsx
                {listing.is_verified && (
                  <span className="inline-flex h-9 items-center rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-3 text-xs font-medium text-emerald-300">
                    Certifié
                  </span>
                )}
                <Toggle listingId={listing.id} active={listing.is_vip} label="VIP" />
```

6. Remplacer le composant `Toggle` par :

```tsx
function Toggle({
  listingId,
  active,
  label,
}: {
  listingId: string;
  active: boolean;
  label: string;
}) {
  return (
    <form action={setCertification}>
      <input type="hidden" name="listing_id" value={listingId} />
      <input type="hidden" name="field" value="is_vip" />
      {/* On envoie l'état *souhaité*, pas une bascule : deux clics rapides ne
          peuvent pas s'annuler mutuellement. */}
      <input type="hidden" name="value" value={active ? "false" : "true"} />
      <button
        type="submit"
        aria-pressed={active}
        className={cx(
          "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition",
          active
            ? "border-transparent bg-action text-slate-950"
            : "border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/[0.09] hover:text-white",
        )}
      >
        <Crown className="size-3.5" aria-hidden />
        {label}
      </button>
    </form>
  );
}
```

- [ ] **Step 5 : Vérifier**

Run : `npx tsc --noEmit 2>&1 | grep -v -E "layout.tsx|types/listing.ts|types/index.ts|__mocks__|PrivateGallery|WhatsAppDirectButton|EmergencyDiscretionButton" | head` puis `npm run build 2>&1 | tail -15`
Expected : aucune erreur de type nouvelle ; build réussi (si le build échoue à cause des fichiers étrangers, le signaler sans les modifier).

Vérification manuelle : se nommer administrateur en local (`insert into public.admins (user_id) select id from auth.users where email = '<vous>';` via `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres`), ouvrir `/admin`, examiner la demande déposée en Task 5 : « Voir la vidéo » affiche un lecteur ; « Approuver » reste désactivé tant que les quatre cases ne sont pas cochées ; après approbation la demande disparaît de la file et apparaît sous « Comptes vérifiés ».

- [ ] **Step 6 : Commit**

```bash
git add src/app/actions/admin.ts src/components/verification/VerificationReview.tsx src/components/verification/AdminVerificationSection.tsx src/app/admin/page.tsx
git commit -m "feat(verification): examen, révocation et purge dans l'administration

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8 : Cycle de vie des données du compte

**Files :**
- Modify : `src/app/actions/account.ts`
- Modify : `src/app/api/mon-compte/export/route.ts`

**Interfaces :**
- Consumes : `deleteUserVerificationFiles(userId): Promise<boolean>` (Task 4).

- [ ] **Step 1 : Supprimer les vidéos avant le compte**

Dans `src/app/actions/account.ts`, ajouter l'import `import { deleteUserVerificationFiles } from "@/lib/verification-storage";`, puis remplacer :

```ts
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
```

par :

```ts
  // La cascade SQL supprime les demandes de vérification, pas les fichiers du
  // bucket. On s'arrête plutôt que de laisser une pièce d'identité orpheline.
  if (!(await deleteUserVerificationFiles(user.id))) {
    return { status: "error", message: "La suppression a échoué. Réessayez dans un instant." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
```

- [ ] **Step 2 : Inclure l'historique dans l'export**

Dans `src/app/api/mon-compte/export/route.ts`, remplacer `const [requests, reviews, listings] = await Promise.all([` par `const [requests, reviews, listings, verifications] = await Promise.all([` et ajouter, comme dernier élément du tableau :

```ts
    // Historique de décision seulement : ni code de défi ni chemin de vidéo.
    supabase
      .from("verification_requests")
      .select("id, status, document_type, submitted_at, reviewed_at, rejection_reason, rejection_note, created_at")
      .eq("user_id", user.id),
```

Dans `payload`, après `offres_publiees: listings.data ?? [],`, ajouter :

```ts
    verifications_identite: verifications.data ?? [],
```

- [ ] **Step 3 : Vérifier**

Run : `npx tsc --noEmit 2>&1 | grep -E "account.ts|export/route.ts"`
Expected : aucune sortie.

- [ ] **Step 4 : Commit**

```bash
git add src/app/actions/account.ts src/app/api/mon-compte/export/route.ts
git commit -m "feat(verification): purge des vidéos à la suppression du compte et export

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9 : Tests de bout en bout

**Files :**
- Create : `e2e/constants.ts`
- Modify : `e2e/global-setup.ts`
- Modify : `e2e/helpers.ts`
- Modify : `e2e/partenaire.spec.ts`, `e2e/catalogue.spec.ts` (sélecteurs périmés)
- Create : `e2e/verification.spec.ts`

**Contexte :** la suite Playwright n'a pas suivi le commit `8f78617` (« align Matripa profile experience ») : elle cherche encore « Mes offres », « Titre de l'offre », « Enregistrer l'offre »… Elle doit être réalignée avant d'y ajouter la vérification, dont les tests réutilisent `signUpPartner` et `publishListing`.

**Interfaces :**
- Produces : `API`, `SERVICE_KEY`, `TEST_PASSWORD`, `ADMIN_EMAIL` (`e2e/constants.ts`) ; `signUpPartner(page, options?: { verified?: boolean }): Promise<string>` (vérifié par défaut) ; `markVerified(email): Promise<void>` ; `signIn(page, email): Promise<void>` ; `latestVerification(email): Promise<{ status: string; video_path: string | null } | null>`.

- [ ] **Step 1 : Extraire les constantes partagées**

`e2e/constants.ts` :

```ts
/**
 * Constantes partagées par `global-setup.ts` et les tests. Ce module n'importe
 * pas `@playwright/test` : il peut être chargé par le setup global.
 *
 * Clés de démonstration publiques de Supabase, identiques sur toute stack locale.
 */
export const API = "http://127.0.0.1:54321";

export const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export const TEST_PASSWORD = "MotDePasseE2E2026!";

export const ADMIN_EMAIL = "admin-e2e@matripa.test";
```

- [ ] **Step 2 : Provisionner un administrateur dans le setup global**

Remplacer `e2e/global-setup.ts` par :

```ts
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

import { ADMIN_EMAIL, API, SERVICE_KEY, TEST_PASSWORD } from "./constants";

/**
 * Remet la base locale à l'état du seed avant chaque exécution.
 *
 * Sans cela, les offres, comptes et demandes créés par la suite s'accumulent
 * d'une exécution à l'autre : les comptages dérivent, la pagination finit par
 * masquer des cartes, et des tests se mettent à échouer pour des raisons sans
 * rapport avec le code. C'est la cause commune de la plupart des instabilités
 * observées sur cette suite — la corriger ici évite d'avoir à durcir chaque
 * assertion une par une.
 */
export default async function globalSetup() {
  execFileSync("supabase", ["db", "reset"], { stdio: "inherit" });

  // `db reset` recrée le schéma storage : le bucket doit être reposé, sinon
  // tout téléversement échoue en 404. Le bucket `verifications`, lui, est créé
  // par la migration 0010.
  execFileSync("curl", [
    "-s", "-o", "/dev/null",
    "-X", "POST", `${API}/storage/v1/bucket`,
    "-H", `apikey: ${SERVICE_KEY}`,
    "-H", `Authorization: Bearer ${SERVICE_KEY}`,
    "-H", "Content-Type: application/json",
    "-d", '{"id":"listings","name":"listings","public":true}',
  ]);

  // Compte administrateur : créé par l'API Admin et non par `insert into
  // auth.users` (piège n° 9 du README).
  const admin = createClient(API, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;

  const { error: adminError } = await admin.from("admins").insert({ user_id: data.user.id });
  if (adminError) throw adminError;
}
```

- [ ] **Step 3 : Réaligner les helpers et ajouter ceux de la vérification**

Dans `e2e/helpers.ts` :

1. Remplacer la ligne `import { expect, type Page } from "@playwright/test";` par :

```ts
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { API, SERVICE_KEY, TEST_PASSWORD } from "./constants";

export { ADMIN_EMAIL, TEST_PASSWORD } from "./constants";
```

2. Supprimer la ligne `export const TEST_PASSWORD = "MotDePasseE2E2026!";`.

3. Dans `countCards`, remplacer `page.locator('p:has-text("offre")')` par `page.locator('p:has-text("profil")')`, `page.getByText("Aucune offre")` par `page.getByText("Aucun profil")`, et l'expression régulière `/([0-9]+)\s*offres?\s+disponibles?/` par `/([0-9]+)\s*profils?\s+disponibles?/`.

4. Remplacer `signUpPartner` par :

```ts
/**
 * Inscription d'un partenaire ; en local la confirmation e-mail est désactivée.
 *
 * Vérifié par défaut : depuis la migration 0010, publier exige un compte
 * vérifié, et la plupart des scénarios ne portent pas sur la vérification.
 */
export async function signUpPartner(
  page: Page,
  { verified = true }: { verified?: boolean } = {},
): Promise<string> {
  const email = uniqueEmail();

  await gotoReady(page, "/connexion");
  await page.getByRole("tab", { name: "inscription" }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Créer mon compte" }).click();

  await page.waitForURL("**/partenaire", { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Mes profils" })).toBeVisible();

  if (verified) {
    await markVerified(email);
    await page.reload();
  }
  return email;
}

const serviceClient = () =>
  createClient(API, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function userIdByEmail(email: string): Promise<string> {
  const { data, error } = await serviceClient().auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((u) => u.email === email);
  if (!user) throw new Error(`compte introuvable : ${email}`);
  return user.id;
}

/** Pose une vérification approuvée, sans passer par l'examen (service_role). */
export async function markVerified(email: string) {
  const { error } = await serviceClient().from("verification_requests").insert({
    user_id: await userIdByEmail(email),
    status: "approved",
    challenge_code: "E2E000",
    document_type: "cni",
    reviewed_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function latestVerification(
  email: string,
): Promise<{ status: string; video_path: string | null } | null> {
  const { data, error } = await serviceClient()
    .from("verification_requests")
    .select("status, video_path")
    .eq("user_id", await userIdByEmail(email))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function signIn(page: Page, email: string) {
  await gotoReady(page, "/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 15_000 });
}
```

5. Dans `publishListing`, appliquer les renommages : `{ name: "Nouvelle offre" }` → `{ name: "Nouveau profil" }`, `getByLabel("Titre de l'offre")` → `getByLabel("Prénom et âge")`, `getByLabel("Type d'offre")` → `getByLabel("Formule")`, `{ name: "Enregistrer l'offre" }` → `{ name: "Publier le profil" }`.

- [ ] **Step 4 : Réaligner les specs existantes**

Appliquer dans `e2e/partenaire.spec.ts` :

| Ancien | Nouveau |
|---|---|
| `{ name: "Mes offres" }` | `{ name: "Mes profils" }` |
| `"Aucune offre pour l'instant"` | `"Aucun profil pour l'instant"` |
| `{ name: "Nouvelle offre" }` | `{ name: "Nouveau profil" }` |
| `getByLabel("Titre de l'offre")` | `getByLabel("Prénom et âge")` |
| `getByLabel("Type d'offre")` | `getByLabel("Formule")` |
| `{ name: "Enregistrer l'offre" }` | `{ name: "Publier le profil" }` |
| `"Offre enregistrée"` | `"Profil enregistré"` |

Et dans `e2e/catalogue.spec.ts` : `"Aucune offre ne correspond"` → `"Aucun profil ne correspond"`.

Puis :

```bash
npm run test:e2e 2>&1 | tail -40
```

Pour chaque échec restant dû à un texte introuvable, retrouver le libellé actuel dans le code (`grep -rn "<fragment du libellé attendu>" src/`) et mettre à jour le sélecteur. Ne modifier **aucun** fichier de `src/` dans cette étape. Si un échec ne relève pas d'un libellé (comportement réellement cassé), l'arrêter là et le signaler.

Expected : suite existante verte.

- [ ] **Step 5 : Écrire les tests de vérification (qui doivent passer contre l'implémentation des Tasks 2 à 8)**

`e2e/verification.spec.ts` :

```ts
import { expect, test, type Page } from "@playwright/test";

import {
  ADMIN_EMAIL,
  gotoReady,
  latestVerification,
  publishListing,
  signIn,
  signUpPartner,
} from "./helpers";

/**
 * Le contenu n'est pas une vraie vidéo : le bucket filtre sur le type déclaré,
 * et Chromium de Playwright, sans codecs propriétaires, ne lit pas la durée —
 * ce que l'application accepte volontairement.
 */
const fakeVideo = () => ({
  name: "selfie.mp4",
  mimeType: "video/mp4",
  buffer: Buffer.from("video-e2e"),
});

async function submitSelfie(page: Page) {
  await gotoReady(page, "/partenaire/verification");
  await page.getByRole("button", { name: "Commencer" }).click();
  await expect(page.getByTestId("challenge-code")).toHaveText(/^[A-Z2-9]{6}$/);

  await page.getByLabel("Pièce d'identité présentée").selectOption("passeport");
  await page.locator('input[type="file"][accept^="video"]').setInputFiles(fakeVideo());
  await page.getByRole("button", { name: "Envoyer la vidéo" }).click();

  await expect(page.getByText("Vérification en cours d'examen")).toBeVisible();
}

test.describe("Vérification d'identité", () => {
  test("un compte non vérifié ne peut pas publier", async ({ page }) => {
    await signUpPartner(page, { verified: false });

    await expect(page.getByText("Vérifiez votre identité pour publier.")).toBeVisible();

    await page.getByRole("link", { name: "Nouveau profil" }).click();
    await page.waitForURL("**/partenaire/annonces/nouvelle");

    await expect(page.getByRole("checkbox", { name: /^Publier/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Enregistrer le brouillon" })).toBeVisible();
  });

  test("approbation : badge sur les profils et vidéo supprimée", async ({ page, browser }) => {
    const email = await signUpPartner(page, { verified: false });
    await submitSelfie(page);

    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await signIn(admin, ADMIN_EMAIL);
    await gotoReady(admin, "/admin");

    const card = admin.locator("li", { hasText: email });
    await expect(card).toBeVisible();

    const approve = card.getByRole("button", { name: "Approuver" });
    await expect(approve).toBeDisabled();
    await card.getByLabel("Le visage correspond aux photos des annonces").check();
    await card.getByLabel("La pièce est lisible et paraît authentique").check();
    await card.getByLabel("La date de naissance indique 18 ans ou plus").check();
    await card.getByLabel("Le code prononcé est le bon").check();
    await approve.click();

    await expect(admin.locator("li", { hasText: email }).getByRole("button", { name: "Révoquer" })).toBeVisible();
    await adminContext.close();

    await expect.poll(async () => (await latestVerification(email))?.video_path, { timeout: 10_000 }).toBeNull();

    await gotoReady(page, "/partenaire/verification");
    await expect(page.getByText("Identité vérifiée")).toBeVisible();

    await gotoReady(page, "/partenaire");
    const titre = await publishListing(page);
    await page.getByText(titre).click();
    await page.waitForURL("**/annonces/**");
    await expect(page.getByText("Certifié").first()).toBeVisible();
  });

  test("rejet : le motif est présenté au partenaire", async ({ page, browser }) => {
    const email = await signUpPartner(page, { verified: false });
    await submitSelfie(page);

    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await signIn(admin, ADMIN_EMAIL);
    await gotoReady(admin, "/admin");

    const card = admin.locator("li", { hasText: email });
    await card.getByLabel("Motif du rejet").selectOption("video_illisible");
    await card.getByRole("button", { name: "Rejeter" }).click();
    await expect(admin.locator("li", { hasText: email })).toBeHidden();
    await adminContext.close();

    await gotoReady(page, "/partenaire/verification");
    await expect(page.getByText("vidéo illisible")).toBeVisible();
    await expect(page.getByRole("button", { name: "Recommencer" })).toBeVisible();
  });
});
```

- [ ] **Step 6 : Exécuter**

Run : `npm run test:e2e 2>&1 | tail -40`
Expected : PASS pour toute la suite, dont les 3 tests de `verification.spec.ts`.

En cas d'échec sur `latestVerification(...).video_path` non nul : consulter la sortie du serveur (`[verification] video deletion failed`) ; la cause la plus probable est une clé `SUPABASE_SERVICE_ROLE_KEY` absente de l'environnement du `webServer`.

- [ ] **Step 7 : Commit**

```bash
git add e2e/constants.ts e2e/global-setup.ts e2e/helpers.ts e2e/partenaire.spec.ts e2e/catalogue.spec.ts e2e/verification.spec.ts
git commit -m "test(verification): parcours de bout en bout et réalignement de la suite

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10 : Documentation et vérification finale

**Files :**
- Modify : `README.md`

- [ ] **Step 1 : Mettre à jour le README**

1. Dans « Structure », sous `partenaire/`, ajouter la ligne `    partenaire/verification/     Vérification d'identité par selfie vidéo`, et changer `migrations/                    0001 → 0009` en `migrations/                    0001 → 0010`.

2. Dans le tableau « Modèle de sécurité », remplacer la ligne `| \`is_vip\`, \`is_verified\` | …` par :

```markdown
| `is_vip` | personne en direct → `set_listing_certification()`, qui vérifie `admins` |
| `is_verified`, `verification_grace_until` | aucun rôle client — dérivés de la vérification du compte par `review_verification()` et le trigger `listings_enforce_verification` |
| `verification_requests` | personne en direct → `start_verification()`, `submit_verification()`, `review_verification()` |
```

et remplacer « Les 34 tests pgTAP verrouillent ces propriétés. » par « Les tests pgTAP (`security.test.sql`, `verification.test.sql`) verrouillent ces propriétés. »

3. Dans le tableau « Tests », remplacer `| pgTAP (34) | RLS, GRANT de colonne, anti-spam, cloisonnement |` par `| pgTAP (79) | RLS, GRANT de colonne, anti-spam, cloisonnement, vérification d'identité |` et ajuster les nombres Vitest et Playwright aux totaux réellement affichés par `npm test` et `npm run test:e2e`.

4. Ajouter, après la section « Avis et confiance », la section :

```markdown
## Vérification d'identité

Publier un profil exige un compte **vérifié** : une personne de l'équipe a contrôlé, sur un selfie vidéo, que le titulaire est **majeur** et correspond à ses photos. Le badge « Certifié » en est la conséquence ; il n'est plus attribuable à la main.

### Parcours

`/partenaire/verification` → `start_verification()` émet un code de 6 caractères valable 30 minutes → la personne se filme 15 s, pièce d'identité près du visage, en prononçant le code → le fichier part directement vers le bucket privé `verifications` → `submit_verification()` vérifie le code, le chemin et l'existence de l'objet → `/admin` : lecture sur URL signée de 5 minutes, quatre contrôles obligatoires, décision → la vidéo est supprimée.

### Quatre propriétés

**Le code vient de la base.** Un code choisi par le client permettrait de réutiliser une vidéo tournée à l'avance.

**Le délai de grâce s'applique à la lecture.** `listings_public_read` exige `is_verified or verification_grace_until > now()`. Au terme du délai, les annonces disparaissent sans tâche planifiée : rien ne peut tomber en panne et laisser des profils non vérifiés en ligne. `submit_request` reprend la même règle, puisqu'elle contourne RLS.

**Le trigger ne contraint que les rôles clients.** `listings_enforce_verification` est `SECURITY INVOKER` et teste `current_user in ('anon', 'authenticated')`. Les fonctions `SECURITY DEFINER` (qui s'exécutent sous le rôle propriétaire), `service_role`, les migrations et le seed passent — c'est ce qui permet à `review_verification` de propager `is_verified`.

**On garde le moins possible.** Ni numéro de pièce ni date de naissance. La vidéo est supprimée par l'API Storage juste après la décision : supprimer la ligne dans `storage.objects` laisserait le fichier en place. Si la suppression échoue, la décision reste acquise et `/admin` propose de purger.

### Constat de minorité

« Signaler une personne mineure » archive toutes les annonces du compte et l'inscrit dans `verification_blocks`. Le compte ne peut plus demander de vérification. Levée du blocage, en SQL uniquement :

```sql
delete from public.verification_blocks where user_id = '<uuid>';
```

### Suppression du compte

`deleteMyAccount` supprime le dossier `verifications/<uid>/` **avant** `deleteUser`. En cas d'échec, la suppression du compte est interrompue : on ne laisse pas de pièce d'identité orpheline.
```

5. Dans « Déploiement › Procédure », ajouter une étape après `supabase db push` :

```markdown
   La migration 0010 crée le bucket privé `verifications` et place toutes les annonces publiées en délai de grâce de 7 jours.
```

6. Dans « Non fait », supprimer la puce « **Certification `/admin`** … » et ajouter :

```markdown
- **Notification des administrateurs** : aucune alerte à l'arrivée d'une vérification ; le compteur de `/admin` fait foi. Brancher `lib/notifications.ts` si le volume le justifie.
```

- [ ] **Step 2 : Vérification complète**

```bash
npm run check
supabase db reset && npm run test:db
npm run test:e2e
npm run build
```

Expected : tout vert. Toute erreur préexistante relevée en Task 0 et toujours présente est signalée telle quelle, sans être corrigée.

- [ ] **Step 3 : Contrôle des fichiers indexés**

```bash
git status --short
```

Expected : seuls restent non indexés les fichiers étrangers listés dans *Global Constraints*.

- [ ] **Step 4 : Commit**

```bash
git add README.md
git commit -m "docs: documenter la vérification d'identité

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
